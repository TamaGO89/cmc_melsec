
/**
 * CMC Marine SLMP
 */

//=============================================================================================
// CONST : constant used throughout the SLMP library
//---------------------------------------------------------------------------------------------
// SLMP CODE : Code associated with each device type (e.g. D: 0xA8)
const SLMP_DEV = {
    // Digital input outputs
    X: {code: 0x9C, base: 16, size: 0},
    Y: {code: 0x9D, base: 16, size: 0},
    // Bit addressed devices
    M: {code: 0x90, base: 10, size: 0},
    L: {code: 0x92, base: 10, size: 0},
    F: {code: 0x93, base: 10, size: 0},
    V: {code: 0x94, base: 10, size: 0},
    B: {code: 0xA0, base: 16, size: 0},
    // Word addressed devices
    D: {code: 0xA8, base: 10, size: 2},
    W: {code: 0xB4, base: 16, size: 2},
    // Special and direct access devices
    SB: {code: 0xA1, base: 16, size: 0},
    SW: {code: 0xB5, base: 16, size: 2},
    SM: {code: 0x91, base: 10, size: 0},
    SD: {code: 0xA9, base: 10, size: 0},
    DX: {code: 0xA2, base: 16, size: 0},
    DY: {code: 0xA3, base: 16, size: 0},
    RD: {code: 0x2C, base: 10, size: 2},
    // File and index access devices
    R: {code: 0xAF, base: 10, size: 2},
    Z: {code: 0xCC, base: 10, size: 2},
    LZ: {code: 0x62, base: 10, size: 4},
    ZR: {code: 0xB0, base: 16, size: 2},
    // Timers
    TS: {code: 0xC1, base: 10, size: 0},
    TC: {code: 0xC0, base: 10, size: 0},
    TN: {code: 0xC2, base: 10, size: 2},
    LTS: {code: 0x51, base: 10, size: 0},
    LTC: {code: 0x50, base: 10, size: 0},
    LTN: {code: 0x52, base: 10, size: 4},
    CS: {code: 0xC4, base: 10, size: 0},
    CC: {code: 0xC3, base: 10, size: 0},
    CN: {code: 0xC5, base: 10, size: 2},
    LCS: {code: 0x55, base: 10, size: 0},
    LCC: {code: 0x54, base: 10, size: 0},
    LCN: {code: 0x56, base: 10, size: 4},
    STS: {code: 0xC7, base: 10, size: 0},
    STC: {code: 0xC6, base: 10, size: 0},
    STN: {code: 0xC8, base: 10, size: 2},
    LSTS: {code: 0x59, base: 10, size: 0},
    LSTC: {code: 0x58, base: 10, size: 0},
    LSTN: {code: 0x5A, base: 10, size: 4}
};

//---------------------------------------------------------------------------------------------
// SLMP TYPE : Reverse association between device type and byte code (e.g. 0xA8: D)
function fromEntries(iterable) {
  return [...iterable].reduce((obj, [key, value]) => {
    obj[key] = value;
    return obj;
  }, {});
}
const SLMP_CODE = fromEntries(Object.entries(SLMP_DEV).map(([k,v]) => [k,v.code]));
const SLMP_TYPE = fromEntries(Object.entries(SLMP_DEV).map(([k,v]) => [v.code,k]));

//---------------------------------------------------------------------------------------------
// SLMP CMD : Dictionary of all the commands supported by SLMP Protocol
const SLMP_CMD = {
    // Get CPU TYPENAME and CODE
    TYPE: Buffer.from(new Uint16Array([0x0101,0x0000]).buffer),
    // Set the CPU in Run (Can be used to clear the devices)
    RUN: Buffer.from(new Uint16Array([0x1001,0x0000]).buffer),
    // Set the CPU in Pause
    PAUSE: Buffer.from(new Uint16Array([0x1003,0x0000]).buffer),
    // Stop the CPU
    STOP: Buffer.from(new Uint16Array([0x1002,0x0000]).buffer),
    // Clear the devices of the CPU
    CLEAR: Buffer.from(new Uint16Array([0x1005,0x0000]).buffer),
    // Reset the CPU
    RESET: Buffer.from(new Uint16Array([0x1006,0x0000]).buffer),
    // Clear the CPU errors
    ERROR: Buffer.from(new Uint16Array([0x1617,0x0000]).buffer),
    // Unlock the CPU (needs a password)
    UNLOCK: Buffer.from(new Uint16Array([0x1630,0x0000]).buffer),
    // Lock the CPU (needs a password)
    LOCK: Buffer.from(new Uint16Array([0x1631,0x0000]).buffer),
    // Loopback test (echoes the message sent)
    ECHO: Buffer.from(new Uint16Array([0x0619,0x0000]).buffer),
    // Read a single block of devices
    READ: Buffer.from(new Uint16Array([0x0401,0x0000]).buffer),
    // Write a single block of devices
    WRITE: Buffer.from(new Uint16Array([0x1401,0x0000]).buffer),
    // Read a set of devices in random order, supports words and dwords
    READ_R: Buffer.from(new Uint16Array([0x0403,0x0000]).buffer),
    // Write a set of devices in random order, supports words, dwords and bits
    WRITE_R: Buffer.from(new Uint16Array([0x1402,0x0000]).buffer),
    // Store a set of devices in random order, these can be queried at any time
    MONITOR: Buffer.from(new Uint16Array([0x0801,0x0000]).buffer),
    // Read a set of device blocks, supports words and bits
    READ_B: Buffer.from(new Uint16Array([0x0406,0x0000]).buffer),
    // Write a set of device blocks, supports words and bits
    WRITE_B: Buffer.from(new Uint16Array([0x1406,0x000]).buffer)
};

//---------------------------------------------------------------------------------------------
// SLMP ARGS : Standard arguments of the SLMP request header
const SLMP_ARGS = {
    SUBHEADER: 0x50,  // Fixed value for the client, the server will be 0xD0
    DEST_NETWORK: 0x00,  // 0x00 if no destination network is specified, otherwise may vary
    DEST_STATION: 0xFF,  // 0xFF if no destination network is specified, otherwise may vary
    DEST_MODULE: 0x03FF,  // 0x03FF is the CPU module and it's currently the only supported one
    DEST_MULTI: 0x00,  // 0x00 if there's only one CPU module connected
    DATA_LENGTH: 0x02,  // 0x02 is the starting data length, "monitor timer" is part of payload
    MNTR_TIMER: 0x04  // 0x04 is standard, it's the waiting time for a response x250ms
};

//---------------------------------------------------------------------------------------------
// SLMP OFFSET : Offsets used to read the SLMP response header and standard payloads
const SLMP_OFFSET = {
    LENGTH: 7,  // This is the offset of the payload length
    PAYLOAD: 11,  // The real payload starts at 11
    ERROR: 9,  // at 9 there's the status code, if 0 everything went fine
    CPUTYPE: 16  // 16 is the length in ASCII characters of the CPU TYPE
};

//---------------------------------------------------------------------------------------------
// SLMP SIZE : Maximum size for each field
const SLMP_SIZE = {
    BATCH: 949,  // The maximum number of words that can be read (960 for R)
    BATCH_B: 3584,  // The maximum number of bits that can be read (7128 for iQ-R)
    RANDOM: 94,  // The first threshold of maximum words/dwords in random access (ONLY iQ-R)
    // RANDOM_MAX: 192,  // The maximum number of words/dwords in random access (ONLY iQ-R)
    // RANDOM: 123,  // The maximum number of words/dwords in random access
    BLOCK: 60
};
//---------------------------------------------------------------------------------------------
// SOCKET ARGS : Standard arguments of a TCP/UDP client
const SOCKET_ARGS = {
    CONN_TIMEOUT: 1000,
    CONN_RETRY: 5,
    DATA_TIMEOUT: 500,
    DATA_RETRY: 3
};
//---------------------------------------------------------------------------------------------
// TYPE SIZE : data type sizes
const TYPE_SIZE = {
	BOOL: 0.125,
	INT: 2,
	DINT: 4,
	WORD: 2,
	DWORD: 4,
	REAL: 4,
	LREAL: 8,
	string: 1,
	wstring: 2
};


//=============================================================================================
// FUNCTIONS : List of static functions used by the client, some are typed on the CPU type
//---------------------------------------------------------------------------------------------
// ENCODE DEVICE : Encode a device string into type bytecode and address
function encode_device(data) {
    for (let i=0; i<data.length; ++i) if (!isNaN(data[i])) {
        let code = SLMP_CODE[data.substring(0,i)];
        let index = parseInt(data.substring(i));
        return (code && index) ? {code,index} : undefined;
    }
}

//---------------------------------------------------------------------------------------------
// DECODE DEVICE : From bytecode and address, return a string rapresenting the device address
function decode_device(code,index) {
    let type = SLMP_TYPE[code];
    return (type && index) ? (type + index.toString()) : undefined;
}

//---------------------------------------------------------------------------------------------
// DEVICE to BUFFER : Encode the device into a buffer array
function dev_to_buff(data) {
    if (data) return Buffer.from(
        new Uint32Array([data.index & 0xFFFFFF | data.code << 24]).buffer);
}

//---------------------------------------------------------------------------------------------
// DEVICE to BUFFER (iQ-R) : Encode the device into a buffer array (for iQ-R CPU type)
function dev_to_buff_r(data) {
    if (data) return Buffer.from( new Uint32Array([data.index,data.code]).buffer,0,6);
}

//---------------------------------------------------------------------------------------------
// BIT to BUFFER : Encode the device address and its 1bit value into a buffer array
function bit_to_buff(device,value=false) {
    if (device) return Buffer.from(
        new Uint32Array([device.index & 0xFFFFFF | device.code << 24, value]).buffer,0,5);
}

//---------------------------------------------------------------------------------------------
// WORD to BUFFER : Encode the device address and its 16bits value into a buffer array
function word_to_buff(device,value=0) {
    if (device) return Buffer.from(
        new Uint32Array([device.index & 0xFFFFFF | device.code << 24, value]).buffer,0,6);
}

//---------------------------------------------------------------------------------------------
// DWORD to BUFFER : Encode the device address and its 32bits value into a buffer array
function dword_to_buff(device,value=0) {
    if (device) return Buffer.from(
        new Uint32Array([device.index & 0xFFFFFF | device.code << 24, value]).buffer);
}

//---------------------------------------------------------------------------------------------
// WORD to BUFFER (iQ-R) : Encode the device address and its 16bits value into a buffer array
function word_to_buff_r(device,value=0) {
    if (device) return Buffer.from(
        new Uint32Array([device.index, device.code | value << 16]).buffer);
}

//---------------------------------------------------------------------------------------------
// DWORD to BUFFER (iQ-R) : Encode the device address and its 32bits value into a buffer array
function dword_to_buff_r(device,value=0) {
    if (device) return Buffer.from(
        new Uint32Array([device.index, device.code | value<<16, value>>16]).buffer,0,10);
}

//---------------------------------------------------------------------------------------------
// BUFFER to DEVICE : Decode a buffer array into its string device address
function buff_to_dev(data) {
    if (data.length == 4) return decode_device(data.readUInt32LE(0) & 0xFFFFFF, data[3]);
}

//---------------------------------------------------------------------------------------------
// BUFFER to DEVICE (iQ-R) : Decode a buffer array into its string device address (for iQ-R)
function buff_to_dev_r(data) {
    if (data.length == 6) return decode_device(data.readUInt32LE(0), data.readUInt16LE(4));
}

//---------------------------------------------------------------------------------------------
// BIT ARRAY to BUFFER : Convert an array of boolean (bit) into a buffer array
function bitarray_to_buff(data) {
    let result = Buffer.alloc(1+data.length>>1).fill(0);
    data.forEach((d,i) => { result[i>>1] += d<<!(i%2)*4; });
    return result;
}

//---------------------------------------------------------------------------------------------
// BUFFER to BIT ARRAY : Convert a buffer array into an array of boolean (bit)
function buff_to_bitarray(data,size) {
    let result = Array(size).fill(false);
    for (let i in result) { result[i] = Boolean(data[i>>1]&(i%2?0x0F:0xF0)); }
    return result;
}

//---------------------------------------------------------------------------------------------
module.exports = {
    SLMP_ARGS: SLMP_ARGS,
    SLMP_CMD: SLMP_CMD,
    SLMP_CODE: SLMP_CODE,
    SLMP_OFFSET: SLMP_OFFSET,
    SLMP_SIZE: SLMP_SIZE,
    SLMP_TYPE: SLMP_TYPE,
    SOCKET_ARGS: SOCKET_ARGS,
    TYPE_SIZE: TYPE_SIZE,
    encode_device: encode_device,
    decode_device: decode_device,
    dev_to_buff: dev_to_buff,
    dev_to_buff_r: dev_to_buff_r,
    bit_to_buff: bit_to_buff,
    bitarray_to_buff: bitarray_to_buff,
    buff_to_bitarray: buff_to_bitarray,
    word_to_buff: word_to_buff,
    word_to_buff_r: word_to_buff_r,
    dword_to_buff: dword_to_buff,
    dword_to_buff_r: dword_to_buff_r,
    buff_to_dev: buff_to_dev,
    buff_to_dev_r: buff_to_dev_r
};
