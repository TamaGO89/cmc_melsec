//---------------------------------------------------------------------------------------------

const { SLMP_Client } = require("./client.js");
const { SLMP_SIZE, SLMP_CMD, TYPE_SIZE } = require("./const.js");
const _utils = require("./utils.js");
const path = require("path");

//---------------------------------------------------------------------------------------------
// USED ONLY BY ADVANDED SLMP CLIENT
function getNested(array,index) {
	let temp = array;
	for (let i of index) temp = temp[i];
	return temp;
}
function setNested(array,index,value) {
	let temp = array;
	if (index.length > 1) for (let i of index.slice(0,-1)) temp = temp[i];
	temp[index.at(-1)] = value;
}
function incrementIndex(index,pairs) {
	let i = index.length-1;
	while (pairs[i].length < 2 || ++index[i] >= pairs[i][1]) {
		index[i] = pairs[i][0];
		if (--i < 0) return false;
	} return true;
}

//=====================================================================================================================
// SLMP client
//---------------------------------------------------------------------------------------------------------------------
class SLMP_Advanced extends SLMP_Client {
    //-----------------------------------------------------------------------------------------------------------------
    constructor(options) {
        super(options.address, options.port, options);
    }

    async batchWriteBits(data) {
        console.log("batch write bits");
        if (data.length>(bit?SLMP_SIZE.BATCH_B:SLMP_SIZE.BATCH))
            throw new Error("unsupported head device or empty data : " + head + " : " + data);
        let encoded_block = this.encodeWord(data,data.size);
        if (!encoded_block)
            throw new Error("unsupported head device or empty data : " + head + " : " + data);
        let encoded_data = Buffer.allocUnsafe(1+data.size>>1).fill(0);
        data.forEach((v) => {
            if (v.meta.dimension.length) {
                let index = v.meta.dimension.map(i=>i[0]);
                let offset = v.meta.offset;
                do {
                    offset = v.meta.encoder(encoded_data,getNested(v.data,index),offset);
                } while (incrementIndex(index,v.meta.dimension));
            } else v.meta.encoder(encoded_data,v.data[0],v.meta.offset)
        });
        let response = await this.request(
            this._slmp_cmd(SLMP_CMD.WRITE,true), Buffer.concat([encoded_block,encoded_data]));
        this._check(response);
        console.log("batch write bits : OVER");
    }

    // TODO
    async randomWriteBits(data) {
        console.log("random write bits");
        if (data.size > SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+data.size);
        encoded_data[0] = Buffer.of(data.size);
        let i=0;
        data.forEach((v) => {
            if (v.meta.dimension.length) {
                let index = v.meta.dimension.map(j=>j[0]);
                const address = {code:v.meta.address.code, index:v.meta.address.index};
                do {
                    if(!(encoded_data[++i] = this.encodeBit(address,getNested(v.data,index))))
                        throw new Error("wrong bit device or value : " + v);
                    address.index++;
                } while (incrementIndex(index,v.meta.dimension));
            } else if(!(encoded_data[++i] = this.encodeBit(v.meta.address,v.data[0])))
                throw new Error("wrong bit device or value : " + v);
        });
        let response = await this.request(this._slmp_cmd(SLMP_CMD.WRITE_R,1), Buffer.concat(encoded_data));
        this._check(response);
        console.log("random write bits : OVER");
    }

    // TODO
    async randomWrite(word,dword) {
        console.log("random write words and dwords");
        if (word.size+dword.size > SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+word.size+dword.size);
        encoded_data[0] = Buffer.of(word.size,dword.size);
        let i=0;
        word.forEach((v) => { i = this._encode_random_write(encoded_data,v,i,this.encodeWord); });
        dword.forEach((v) => { i = this._encode_random_write(encoded_data,v,i,this.encodeDWord); });
        let response = await this.request(this._slmp_cmd(SLMP_CMD.WRITE_R), Buffer.concat(encoded_data));
        this._check(response);
        console.log("random write words and dwords : OVER");
    }

    // TODO
    async blockWrite(word,bits) {
        console.log("block write words and bits");
        if (word.size+bits.size > SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+(word.length+bits.length<<1));
        encoded_data[0] = Buffer.of(word.length,bits.length);
        let i=0;
        word.forEach((vars) => { i = this._encode_block(encoded_data,vars,i); });
        bits.forEach((vars) => { i = this._encode_block(encoded_data,vars,i); });
        console.log("written until : " + i + " : on an array of length : " + encoded_data.length + " : set as : " + (1+(word.length+bits.length<<1)));
        let response = await this.request(this._slmp_cmd(SLMP_CMD.WRITE_B),Buffer.concat(encoded_data));
        this._check(response);
        console.log("block write words and bits : OVER");
    }

    // TODO
    async blockRead(word,bits) {
        console.log("block read words and bits");
        if (word.size+bits.size > SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+word.length+bits.length);
        encoded_data[0] = Buffer.of(word.length,bits.length);
        let i=0,j=0;
        word.forEach((vars) => { if(!(encoded_data[++i] = this.encodeWord(vars,1+vars.buffer>>1)))
            throw new Error("wrong word device : " + vars); });
        bits.forEach((vars) => { if(!(encoded_data[++i] = this.encodeWord(vars,1.875+vars.buffer>>1)))
            throw new Error("wrong word device : " + vars); });
        let response = await this.request(this._slmp_cmd(SLMP_CMD.READ_B),Buffer.concat(encoded_data));
        this._check(response,word.buffer+(1.875+bits.buffer>>1<<1));
        word.forEach((vars) => { j = this._decode_block(response.data,vars,j); });
        bits.forEach((vars) => { j = this._decode_block(response.data,vars,j); });
        console.log("block read words and bits : OVER");
    }

    // TODO
    async randomRead(word,dword) {
        console.log("random read words and dwords");
        if (word.size+dword.size > SLMP_SIZE.RANDOM)
            throw new Error("wrong data size, word and dword maximum size is 0xFF");
        let encoded_data = Array(1+word.size+dword.size);
        encoded_data[0] = Buffer.of(word.size,dword.size);
        let i=0,j=0;
        word.forEach((v) => { i = this._encode_random_read(encoded_data,v,i); });
        dword.forEach((v) => { i = this._encode_random_read(encoded_data,v,i); });
        let response = await this.request(this._slmp_cmd(SLMP_CMD.READ_R), Buffer.concat(encoded_data));
        this._check(response,word.buffer+dword.buffer);
        word.forEach((v) => { j = this._decode_random(response.data,v,j); });
        dword.forEach((v) => { j = this._decode_random(response.data,v,j); });
        console.log("random read words and dwords : OVER");
    }

    //-----------------------------------------------------------------------------------------------------------------
    _encode_random_write(data,v,i,encoder) {
        if (v.meta.dimension.length) {
            let index = v.meta.dimension.map(j=>j[0]);
            const address = {code:v.meta.address.code, index:v.meta.address.index};
            do {
                if(!(data[++i] = encoder(address,0)))
                    throw new Error("wrong bit device or value : " + v);
                v.meta.encoder(data[i],getNested(v.data,index),data[i].length - v.meta.type.size);
                address.index += v.meta.type.size / v.meta.address.size;
            } while (incrementIndex(index,v.meta.dimension));
        } else {
            if(!(data[++i] = encoder(v.meta.address,0)))
                throw new Error("wrong bit device or value : " + v);
            v.meta.encoder(data[i],v.data[0],data[i].length - v.meta.type.size);
        }
        return i;
    }

    _encode_random_read(data,v,i) {
        if (v.meta.dimension.length) {
            let index = v.meta.dimension.map(j=>j[0]);
            const address = {code:v.meta.address.code, index:v.meta.address.index};
            do {
                if(!(data[++i] = this.encodeDevice(address)))
                    throw new Error("wrong bit device or value : " + v);
                address.index += v.meta.type.size / v.meta.address.size;
            } while (incrementIndex(index,v.meta.dimension));
        } else {
            if(!(data[++i] = this.encodeDevice(v.meta.address)))
                throw new Error("wrong bit device or value : " + v);
        }
        return i;
    }

    _encode_block(data,vars,i) {
        if(!(data[++i] = this.encodeWord(vars,vars.buffer/TYPE_SIZE.WORD)))
            throw new Error("wrong word block head device or length : " + vars.address + " : " + vars.size);
        data[++i] = Buffer.allocUnsafe(vars.buffer);
        vars.forEach((v) => {
            if (v.meta.dimension.length) {
                let index = v.meta.dimension.map(j=>j[0]);
                let offset = v.meta.offset;
                do {
                    offset = v.meta.encoder(data[i],getNested(v.data,index),offset);
                } while (incrementIndex(index,v.meta.dimension));
            } else v.meta.encoder(data[i],v.data[0],v.meta.offset);
        });
        return i;
    }

    _decode_block(data,vars,i) {
        vars.forEach((v) => {
            if (v.meta.dimension.length) {
                let index = v.meta.dimension.map(j=>j[0]);
                let offset = v.meta.offset;
                do {
                    setNested(v.data,index,v.meta.decoder(data,(i<<1)+offset));
                    offset += v.meta.type.size;
                } while (incrementIndex(index,v.meta.dimension));
            } else v.data[0] = v.meta.decoder(data,(i<<1)+v.meta.offset);
        });
        return i + (1.875+vars.buffer>>1);
    }

    _decode_random(data,v,i) {
        if (v.meta.dimension.length) {
            let index = v.meta.dimension.map(j=>j[0]);
            let offset = v.meta.offset;
            do {
                setNested(v.data,index,v.meta.decoder(data,(i<<1)+offset));
                offset += v.meta.type.size;
            } while (incrementIndex(index,v.meta.dimension));
        } else v.data[0] = v.meta.decoder(data,(i<<1)+v.meta.offset);
        return i + (1.875+v.buffer>>1);
    }
}

//---------------------------------------------------------------------------------------------------------------------
// EXPORTS

module.exports = {
	SLMP_Advanced: SLMP_Advanced
};
