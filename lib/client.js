
/**
 * CMC Marine SLMP Client
 */

//=====================================================================================================================
// Import standard libraries
const net = require("net");
const EventEmitter = require("events");
const dgram = require("dgram");
const _const = require("./const.js");

//=====================================================================================================================
// ETH client
//---------------------------------------------------------------------------------------------------------------------

class ETH_Client extends EventEmitter {

    //-----------------------------------------------------------------------------------------------------------------
    constructor(host, port, options={}) {
        super();
        // typed functions, depending on TCP/UDP connection type
        this.socketClose = null;
        this.socketWrite = null;
        // define class attributes
        this.socket_args = {};
        this.socket_args.host = this.socket_args.address = host;
        this.socket_args.port = port;
        this.is_udp = options.protocol === "udp";
        this.is_connected = false;
        this.is_connecting = false;
        this.socket = null;
        this.queue = [];
        // define timers
        this.conn_index = 0;
        this.conn_timeout = options.conn_timeout !== undefined ?
                options.conn_timeout : _const.SOCKET_ARGS.CONN_TIMEOUT;
        this.conn_retry = options.conn_retry !== undefined ?
                options.conn_retry : _const.SOCKET_ARGS.CONN_RETRY;
        this.conn_timer = null;
        this.data_index = 0;
        this.data_timeout = options.data_timeout !== undefined ?
                options.data_timeout : _const.SOCKET_ARGS.DATA_TIMEOUT;
        this.data_retry = options.data_retry !== undefined ?
                options.data_retry : _const.SOCKET_ARGS.DATA_RETRY;
    }

    //-----------------------------------------------------------------------------------------------------------------
    connect() {
        if (this.is_connecting) return;
        this.is_connecting = true;
        this.close();
        if (this.is_udp) {
            this.socket = dgram.createSocket("udp4");
            this.socketClose = () => { return this.socket.close(); };
            // this.socketWrite = (data) => { return this.socket.send(data); };
            this.socketWrite = (data) => { 
                return this.socket.send(data, 0, data.length, this.socket_args.port, this.socket_args.host); };
            this.socket.on("connect", () => this.onConnect())
                       .on("close", () => this.onClose())
                       .on("message", (data,info) => this.onData(data))
                       .on("error", (err) => this.onError(err))
            this.onConnect();
            // this.socket.connect(this.socket_args.port, this.socket_args.host);
        } else {
            this.socket = new net.Socket();
            //this.socketClose = () => { return this.socket.resetAndDestroy(); };
            this.socketClose = () => { return this.socket.destroy(); };
            this.socketWrite = (data) => { return this.socket.write(data); };
            this.socket.on("ready", () => this.onConnect())
                       .on("close", () => this.onClose())
                       .on("data", (data) => this.onData(data))
                       .on("error", (err) => this.onError(err))
                       .connect(this.socket_args);
            if (this.conn_timeout > 0) this.conn_timer = setTimeout(() => this.onTimeout(), this.conn_timeout);
        }
    }

    close() {
        if (this.socket)
            this.socketClose();
        this.socket = null;
        this.queue = [];
    }

    //-----------------------------------------------------------------------------------------------------------------
    isConnected() { return this.is_connected; }
    isConnecting() { return this.is_connecting; }

    //-----------------------------------------------------------------------------------------------------------------
    onConnect() {
        console.log("connected to client");
        this.is_connected = true;
        this.is_connecting = false;
        if (this.conn_timer) this.conn_timer = clearTimeout(this.conn_timer);
        this.conn_index = 0;
        this.emit("connect")
    }

    onClose() {
        console.log("connection closed");
        this.is_connecting = false;
        this.is_connected = false;
        this.queue = [];
        this.emit("close");
        this._reconnect();
    }

    onTimeout() {
        console.log("connection timeout");
        this.is_connected = false;
        this.is_connecting = false;
        this.queue = [];
        this.emit("timeout");
        this._reconnect();
    }

    onError(error) {
        console.log("connection error : " + error.toString("hex"));
        this.is_connecting = false;
        this.emit("error", error);
        if (!this.is_connected) this._reconnect();
    }

    onData(data) {
        console.log("data arrived : " + data.toString("hex"));
        this.response(data);
        this.emit("data",data);
    }

    //-----------------------------------------------------------------------------------------------------------------
    send(data) {
        // if (!(this.socket && (this.is_connected||this.is_udp))) {
        if (!(this.socket && this.is_connected)) {
          this.onTimeout();
          return false;
        }
        console.log("sending data : " + data.toString("hex"));
        let result = this.socketWrite(data);
        return result;
    }

    response(data) {
        if (this.queue.length) {
            this.queue.shift().resolve(data);
            if (this.queue.length)
                this.send(this.queue[0].data);
        }
    }

    request(data) {
        return new Promise( async (resolve,reject) => {
            this.queue.push({data,resolve,reject});
            if (this.queue.length===1)
                this.send(data);
        });
    }

    //-----------------------------------------------------------------------------------------------------------------
    // Private functions
    _reconnect() {
        if (!this.conn_index) this.emit("reconnect");
        if (this.conn_index++ < this.conn_retry) this.connect();
    }
}


//=====================================================================================================================
// SLMP client
//---------------------------------------------------------------------------------------------------------------------
class SLMP_Client extends ETH_Client {

    //-----------------------------------------------------------------------------------------------------------------
    constructor(host, port=5007, options={}) {
        super(host,port,options);
        this.encodeDevice = null;
        this.encodeWord = null;
        this.encodeBit = null;
        this.encodeDWord = null;
        this.decodeDevice = null;
        this.data_timeout = (
            options.mntr_timer !== undefined ? options.mntr_timer : _const.SLMP_ARGS.MNTR_TIMER) << 2;
        this.slmp_header = Buffer.alloc(11);
        this.mntr = {words:0, dwords:0, cmd:_const.SLMP_CMD.MONIOR};
        let offset = 0;
        offset = this.slmp_header.writeUInt16LE(_const.SLMP_ARGS.SUBHEADER, offset);
        offset = this.slmp_header.writeUInt8(
            options.dest_network !== undefined ? options.dest_network : _const.SLMP_ARGS.DEST_NETWORK, offset);
        offset = this.slmp_header.writeUInt8(
            options.dest_station !== undefined ? options.dest_station : _const.SLMP_ARGS.DEST_STATION, offset);
        offset = this.slmp_header.writeUInt16LE(
            options.dest_module !== undefined ? options.dest_module : _const.SLMP_ARGS.DEST_MODULE, offset);
        offset = this.slmp_header.writeUInt8(
            options.dest_multi !== undefined ? options.dest_multi : _const.SLMP_ARGS.DEST_MULTI, offset);
        offset = this.slmp_header.writeUInt16LE(
            options.mntr_timer !== undefined ? options.mntr_timer : _const.SLMP_ARGS.MNTR_TIMER, offset+2);
    }

    //-----------------------------------------------------------------------------------------------------------------
    async onConnect() {
        super.onConnect();
        this.cpu_type = await this.getCpuType();
        this._set_parsers();
        this.emit("ready");
    }

    response(data) {
        let code = data.readUInt16LE(_const.SLMP_OFFSET.ERROR);
        data = data.subarray(_const.SLMP_OFFSET.PAYLOAD,data.length);
        super.response({code,data});
    }

    request(cmd,data=Buffer.alloc(0)) {
        let request = Buffer.concat([this.slmp_header,cmd,data]);
        request.writeUInt16LE(_const.SLMP_ARGS.DATA_LENGTH+cmd.length+data.length, _const.SLMP_OFFSET.LENGTH);
        return super.request(request);
    }

    //-----------------------------------------------------------------------------------------------------------------
    async getCpuType() {
        let response = await this.request(_const.SLMP_CMD.TYPE);
        this._check(response,_const.SLMP_OFFSET.CPUTYPE+2);
        return {
            type: response.data.subarray(0,_const.SLMP_OFFSET.CPUTYPE).toString("ascii").trim(),
            code: response.data.readUInt16LE(_const.SLMP_OFFSET.CPUTYPE)
        }
    }
    async remoteRun(force=false,clear=0) {
        let response = await this.request(_const.SLMP_CMD.RUN, Buffer.of(1|force<<1,0,clear,0));
        this._check(response);
    }
    async remotePause(force=false) {
        let response = await this.request(_const.SLMP_CMD.PAUSE,Buffer.of(1|force<<1,0));
        this._check(response);
    }
    async remoteStop(force=false) {
        let response = await this.request(_const.SLMP_CMD.STOP,Buffer.of(1|force<<1,0));
        this._check(response);
    }
    async remoteClear() {
        let response = await this.request(_const.SLMP_CMD.CLEAR,Buffer.of(1,0));
        this._check(response);
    }
    async remoteReset() {
        let response = await this.request(_const.SLMP_CMD.RESET,Buffer.of(1,0));
        this._check(response);
    }
    async remoteError() {
        let response = await this.request(_const.SLMP_CMD.ERROR);
        this._check(response);
    }
    async testEcho(data) {
        let length = Buffer.alloc(2);
        length.writeUInt16LE(data.length,0);
        let response = await this.request(_const.SLMP_CMD.ECHO,Buffer.concat([length,data]))
        this._check(response,data.length+2);
        return {
            length: response.data.readUInt16LE(0),
            data: response.data.subarray(2,response.data.length)
        }
    }
    // async remoteLock(password) {};
    // async remoteUnlock(password) {};

    //-----------------------------------------------------------------------------------------------------------------
    async batchRead(head,size,bit=false) {
        if (size>(bit?_const.SLMP_SIZE.BATCH_B:_const.SLMP_SIZE.BATCH))
            throw new Error("unsupported head device or wrong size : " + head + " : " + size);
        let encoded_block = this.encodeWord(head,size);
        if (!(encoded_block && size && size<(bit?_const.SLMP_SIZE.BATCH_B:_const.SLMP_SIZE.BATCH)))
            throw new Error("unsupported head device or wrong size : " + head + " : " + size);
        let response = await this.request(this._slmp_cmd(_const.SLMP_CMD.READ,bit), encoded_block);
        this._check(response,bit ? 1+size>>1 : size<<1);
        return bit ? _const.buff_to_bitarray(response.data,size) : response.data;
    }

    async batchWrite(head,data,bit=false) {
        if (data.length>(bit?_const.SLMP_SIZE.BATCH_B:_const.SLMP_SIZE.BATCH))
            throw new Error("unsupported head device or empty data : " + head + " : " + data);
        let encoded_block = this.encodeWord(head,bit ? data.length : data.buffer.byteLength/2);
        if (!encoded_block)
            throw new Error("unsupported head device or empty data : " + head + " : " + data);
        let encoded_data = bit ? _const.bitarray_to_buff(data) : Buffer.from(data.buffer);
        let response = await this.request(
            this._slmp_cmd(_const.SLMP_CMD.WRITE,bit), Buffer.concat([encoded_block,encoded_data]));
        this._check(response);
    }

    async randomRead(word,dword) {
        let encoded_data = this._encode_request(word,dword);
        let response = await this.request(this._slmp_cmd(_const.SLMP_CMD.READ_R), Buffer.concat(encoded_data));
        this._check(response,(word.length<<1)+(dword.length<<2));
        let i=0,j=0;
        for (; i<word.length; ++i) word[i] = response.data.readUInt16LE(i<<1);
        i = i<<1;
        for (; j<dword.length; ++j) dword[j] = response.data.readUInt32LE(i+(j<<2));
        return {word,dword};
    }

    async randomWrite(word,dword) {
        if (word.length+dword.length > _const.SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+word.length+dword.length);
        encoded_data[0] = Buffer.of(word.length,dword.length);
        let i=0;
        word.forEach((device) => { if(!(encoded_data[++i] = this.encodeWord(...device)))
            throw new Error("wrong word device or value : " + device); });
        dword.forEach((device) => { if(!(encoded_data[++i] = this.encodeDWord(...device)))
            throw new Error("wrong word device or value : " + device); });
        let response = await this.request(this._slmp_cmd(_const.SLMP_CMD.WRITE_R), Buffer.concat(encoded_data));
        this._check(response);
    }

    async randomWriteBits(bits) {
        if (bits.length > _const.SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+bits.length);
        encoded_data[0] = Buffer.of(bits.length);
        let i=0;
        bits.forEach((device) => { if(!(encoded_data[++i] = this.encodeBit(...device)))
            throw new Error("wrong word device or value : " + device); });
        let response = await this.request(this._slmp_cmd(_const.SLMP_CMD.WRITE_R,1), Buffer.concat(encoded_data));
        this._check(response);
    }

    async blockRead(word,bits) {
        if (word.length+bits.length > _const.SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+word.length+bits.length);
        encoded_data[0] = Buffer.of(word.length,bits.length);
        let i=0,j=0,size=0;
        word.forEach((device) => { size += device[1]; if(!(encoded_data[++i] = this.encodeWord(...device)))
            throw new Error("wrong word device : " + device); });
        bits.forEach((device) => { size += device[1]; if(!(encoded_data[++i] = this.encodeWord(...device)))
            throw new Error("wrong word device : " + device); });
        let response = await this.request(this._slmp_cmd(_const.SLMP_CMD.READ_B),Buffer.concat(encoded_data));
        this._check(response,size<<1);
        word.forEach((device) => { 
            size = device[1];
            device[1] = Array(size);
            for (i=0; i<size; ++i)
                device[1][i] = response.data.readUInt16LE(j++<<1); });
        bits.forEach((device) => {
            size = device[1];
            device[1] = Array(size);
            // TODO : This will data will be bit addressed
            for (i=0; i<size; ++i)
                device[1][i] = response.data.readUInt8(j++<<1); });
        return {word,bits};
    }

    async blockWrite(word,bits) {
        if (word.length+bits.length > _const.SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+(word.length+bits.length<<1));
        encoded_data[0] = Buffer.of(word.length,bits.length);
        let i=0;
        word.forEach((device) => {
            if(!(encoded_data[++i] = this.encodeWord(device[0],device[1].length)))
                throw new Error("wrong word device : " + device);
            encoded_data[++i] = Buffer.from(device[1].buffer); });
        bits.forEach((device) => {
            if(!(encoded_data[++i] = this.encodeWord(device[0],device[1].length)))
                throw new Error("wrong word device : " + device);
            encoded_data[++i] = Buffer.from(device[1].buffer); });
        console.log("written until : " + i + " : on an array of length : " + encoded_data.length + " : set as : " + (1+(word.length+bits.length)<<1));
        let response = await this.request(this._slmp_cmd(_const.SLMP_CMD.WRITE_B),Buffer.concat(encoded_data));
        this._check(response);
    }

    async setMonitor(word,dword) {
        let encoded_data = this._encode_request(word,dword);
        let monitor_cmd = this._slmp_cmd(_const.SLMP_CMD.MONITOR); 
        let response = await this.request(monitor_cmd, Buffer.concat(encoded_data));
        this._check(response);
        this.mntr.words = word.length;
        this.mntr.dwords = dword.length;
        monitor_cmd[0] = 2;
        this.mntr.cmd = monitor_cmd;
    }

    async getMonitor() {
        let word = Array(this.mntr.words);
        let dword = Array(this.mntr.dwords);
        let response = await this.request(this.mntr.cmd);
        this._check(response,(word.length<<1)+(dword.length<<2));
        let i=0,j=0;
        for (; i<word.length; ++i) word[i] = response.data.readUInt16LE(i<<1);
        i = i<<1;
        for (; j<dword.length; ++j) dword[j] = response.data.readUInt32LE(i+(j<<2));
        return {word,dword};
    }

    //-----------------------------------------------------------------------------------------------------------------
    _check(response,length=0) {
        if (response.code)
            console.log("request returned with exception code : " + response.code.toString(16) + "\n" +
                            "response data : " + response.data.toString("hex"));
        if (length && (length-response.data.length))
            console.log("response length don't match : " + response.data.length + " : " + length + "\n" +
                            "response data : " + response.data.toString("hex"));
    }
    // TODO : This is not entirely correct, the length of the payloads depends on the subcommand,
    // R type PLCs supports different size depending on the subcommand, while older PLC types don't
    // If i use R type, for small payloads most subcommands have the third bit = 1
    // Since we're talking about payloads greater than 0.1KB, for now this can be left as it is.
    _slmp_cmd(cmd,bit=false) {
        let result = Buffer.from(cmd);
        result[2] = bit | this.cpu_type.is_r << 1;
        return result;
    }
    _encode_request(word,dword) {
        if (word.length+dword.length > _const.SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+word.length+dword.length);
        encoded_data[0] = Buffer.of(word.length,dword.length);
        let i=0;
        word.forEach((device) => { if(!(encoded_data[++i] = this.encodeDevice(device)))
            throw new Error("wrong word device : " + device); });
        dword.forEach((device) => { if(!(encoded_data[++i] = this.encodeDevice(device)))
            throw new Error("wrong word device : " + device); });
        return encoded_data;
    }
    _set_parsers() {
        if (this.cpu_type.is_r = (this.cpu_type.type.indexOf("R") == 0)) {
            this.encodeDevice = _const.dev_to_buff_r;
            this.encodeBit = _const.word_to_buff_r;
            this.encodeWord = _const.word_to_buff_r;
            this.encodeDWord = _const.dword_to_buff_r;
            this.decodeDevice = _const.buff_to_dev_r;
        } else {
            this.encodeDevice = _const.dev_to_buff;
            this.encodeBit = _const.bit_to_buff;
            this.encodeWord = _const.word_to_buff;
            this.encodeDWord = _const.dword_to_buff;
            this.decodeDevice = _const.buff_to_dev;
        }
    }
}

//---------------------------------------------------------------------------------------------------------------------
// EXPORTS

module.exports = {
    ETH_Client: ETH_Client,
    SLMP_Client: SLMP_Client
}
