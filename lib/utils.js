
/**
 * CMC Marine SLMP
 */

//=====================================================================================================================
// Import standard libraries
const { cloneDeep, result } = require("lodash");
const { TYPE_ENCODER, TYPE_DECODER, TYPE_SIZE } = require("./const.js");

//---------------------------------------------------------------------------------------------
/**
 * Parses a single variable object from JSON.
 * If the variable is an array (non‑empty "dimension"), it returns an array;
 * otherwise, it returns an object.
 * The metadata is stored in the "_" property.
 *
 * @param {Object} data - A variable object from JSON.
 * @returns {Object|Array} The result variable.
 */
function parseVariable(data) {
	const result = data.struct && !data.dimension.length ? {} : [];
	result._ = {encoder: TYPE_ENCODER[data.type.source], decoder: TYPE_DECODER[data.type.source]};
	Object.keys(data).forEach( k => {
		switch(k) { 
			case "struct":
				result._[k] = true;
				break;
			case "length":
				result._.size = data[k];
				break;
			default:
				result._[k] = data[k];
				break;
		}
	});
	if (data.struct)
		return Object.assign(result, parseStruct(data.struct, data.dimension.length));
	value = result._.value;
	for (let pair of data.dimension.slice().reverse())
		value = Array(pair[1]-pair[0]+1).fill(value);
	if (Array.isArray(value))
		result.push(...value);  // TODO : This might not work in node12.0
	else
		result.push(value);
	return result;
}

/**
 * Recursively processes the "struct" field.
 *
 * @param {Array} data - The struct field data (an array, possibly nested).
 * @param {number} len - The total number of levels expected.
 * @returns {Object|Array} At the last level, returns an object keyed by attribute name.
 *                         Otherwise, returns an array (with each element processed recursively).
 */
function parseStruct(data, len) {
	return len ? data.map(d => parseStruct(d, len-1)) : parseVariables(data);
}

/**
 * Parses the top‑level JSON array into an object keyed by each variable's name.
 *
 * @param {Array} data - The JSON array of variable objects.
 * @returns {Object} An object mapping variable names to result variables.
 */
function parseVariables(data, result={}) {
	data.forEach(d => { result[d.name] = parseVariable(d); });
	return result;
}

function parseAllVariables(data) {
	const result = {};
	Object.values(data).forEach((value) => { parseVariables(value,result); } );
	return result;
}

//---------------------------------------------------------------------------------------------
function getVariable(obj, path) {
	if (!path) return;
	const keys = path.replace(/\[(\w+:?\w*)\]/g, '.$1').split('.');
	let index = keys.length;
	for (; index>0; --index) if (!/\d+:?\d*/g.test(keys[index-1])) break;
	const temp = keys.slice(0,index).reduce((o,k) => o ? o[k] : undefined, obj);
	if (!temp) throw new Error(`Element not found : ${keys} : ${arrs}`);
	const meta = cloneDeep(temp._);
	const arrs = keys.slice(index).map((a,i) => a.split(':').map(v => Number(v)-meta.dimension[i][0]));
	meta.dimension = meta.dimension.map((pair) => [0,pair[1] - pair[0] + 1]);
	meta.buffer = meta.size * meta.type.size;
	meta.offset = 0;
	if (!arrs.length) return {data: temp, meta: meta};
	let offset = 0, len = 1, size = 1, depth = meta.dimension.length;
	for (let dimension of meta.dimension.slice().reverse()) {
		if (arrs.length < depth--) {
			size = len *= dimension[1];
			continue;
		}
		offset += arrs[depth][0] * len;
		if (arrs[depth].length > 1) size *= ++arrs[depth][1] - arrs[depth][0];
		len *= dimension[1];
		meta.dimension[depth] = arrs[depth];
	}
	meta.size = size;
	meta.buffer = meta.size * meta.type.size;
	// meta.offset = offset;  i don't need this...
	meta.offset = 0;
	meta.address.index += offset * meta.type.size / meta.address.size | 0;
	meta.address.source = meta.address.type + meta.address.index;
	// TODO : SUB INDEX WILL BE EVALUATED IN THE FUTURE, FOR NOW BIT ADDRESSED DEVS WON'T BE SUPPORTED
	return {data: temp, meta: meta};
}


function insertVariable(var_group,variable) {
	// TODO : What if the variable already exist?
	const var_list = var_group.codes[variable.meta.address.code];
	if (var_list) {
		let index = var_list.findIndex(u => u.meta.address.index > variable.meta.address.index);
		if (index < 0) var_list.push(variable);
		else var_list.splice(index,0,variable);
		var_list.buffer += variable.meta.size*variable.meta.type.size;
	} else {
		const new_list = var_group.codes[variable.meta.address.code] = [variable];
		new_list.size = variable.meta.address.size;
		new_list.buffer = variable.meta.size*variable.meta.type.size;
		var_group.length++;
	}
}
function getCommandGroup(...variables) {
	const result = variables;
	const address = variables.length > 0 ? variables[0].meta.address : {};
	result.index=address.index;
	result.code=address.code;
	result.size=0;
	result.buffer=0;
	return result;
}

//---------------------------------------------------------------------------------------------
/*
 * (1) If read, check v.meta.address.size,
 * if (address.index - w.index - w.size < THRESHOLD / address.size)
 * then append to the same command sequence
 * (2) For the initial tests i'll support only the "block read" and "random write" requests.
 * Later i'll be able to decide which is the best command/subcommand depending on the variable list
 * IF (READ) prefer block read, if devices are close enough (0...2 words apart), connect them together
 * Since read/write operations on bits is performed in chunks of 16bits,
 * this means that bits can be up to 16,32 address apart
 * IF (WRITE) prefer block write for words and dwords, these may be written in good chunks of adiacent devices.
 * for bits random write, bits are used for control and alarms, there are always only a chunk of them, not so much.
 * (3) 15/6 is the header length / the device description length
 * These two values should depend on the different versions of SLMP protocol
 * (4) currently array are not supported, they're complex to implement and requires additional setup
 * (5) change this into a different command, like this is not maintainable for high volumes of devices
 * 
 * Think about removing source and codes from the final results, so far i'm only using cmd and variables
 * that should be renamed callbacks and variables (for readability)
 */
function parseRules(data,rules,type) {
	const result = {};
	// parse rules into a temporary variable, retrieve all variables from the already parsed data
	for (const rule of rules) {
		// Each topic must be a unique key
		result[rule.topicname] = {
			codes: {},
			length: 0,
			variables: [],
			rate: rule.rate,
			options: rule.options
		};
		// Each topic may also have a publishing rate (if transmitted)
		// if (rule.rate && !result[rule.rate]) result[rule.rate] = {codes: {}, length: 0, variables: []};
		// TODO : Manage data structures, which are currently unmanaged
		console.log(rule);
		for (const varname of rule.variables) {
			const variable = getVariable(data,varname);
			if (variable) {
				console.log(variable.meta);
				insertVariable(result[rule.topicname],variable);
			}
		}
	}
	const VARS_SIZE = [TYPE_SIZE.BOOL, TYPE_SIZE.WORD, TYPE_SIZE.DWORD];
	const _tolerance = TYPE_SIZE.WORD * (type !== "write");
	// loop all the parsed rules and variables, the objective is to devide them in chunks of adjacent variables
	for (const group of Object.values(result)) {
		// group = {variables: <[code,variables]>, type: <read or write>, length: <number device types>}
		const groups = {};
		for (let size of VARS_SIZE) {
			groups[size] = {blocks: getCommandGroup(), random: getCommandGroup(), size: 0, buffer: 0};
		}
		// Sort the variable of the group by code and then by index
		for (const variables of Object.values(group.codes)) {
			group.variables = group.variables.concat(variables);
			// variables = [<list of vars>, size: <address size>, buffer: <size in devices>]
			if (variables.length < 1) continue;
			let w = getCommandGroup(variables[0]);
			console.log(`VARIABLES START : ${variables[0].meta.name}`)
			for (let i=1; i <= variables.length; ++i) {
				const v = variables[i];
				// TODO : (1)
				if (v) console.log(`VARIABLE : ${v.meta.name} : ${v.meta.address.index}`); else console.log("VARIABLE : __LAST");
				let temp_offset = v ?( (v.meta.address.index-w.index)*v.meta.type.size) : -1;
				if (temp_offset>=w.buffer&&temp_offset<=w.buffer+_tolerance) {
					console.log(`pushed in W : ${temp_offset} , ${w.buffer} , ${_tolerance}`);
					v.meta.offset = temp_offset;
					w.push(v);
					w.buffer = temp_offset + v.meta.size*v.meta.type.size;
					w.size = v.meta.address.index -w.index + v.meta.size;
				} else {
					groups[variables.size].buffer += w.buffer;
					// TODO : (3)
					// TODO : I should be able to manage everything in here. i've the variables, i know their sizes
					if (w.buffer > 15/6) {
						console.log(`pushed W in BLOCK : ${temp_offset} , ${w.buffer} , ${_tolerance}`);
						groups[variables.size].blocks.push(w);
						groups[variables.size].blocks.buffer += w.buffer;
						groups[variables.size].blocks.size += w.size;
					} else {
						console.log(`pushed W in RANDOM : ${temp_offset} , ${w.buffer} , ${_tolerance}`);
						for (const u of w) {
							console.log(`RANDOM PUSH ${u.meta.name}`);
							u.meta.offset = 0;
							const var_size = VARS_SIZE.includes(u.meta.type.size)?u.meta.type.size:variables.size;
							groups[var_size].random.push(u);
							groups[var_size].random.buffer += u.meta.size*u.meta.type.size;
							groups[var_size].random.size += u.meta.size;
						}
					}
					if (v) {
						console.log("new with next variable");
						w = getCommandGroup(v);
						w.buffer = v.meta.size*v.meta.type.size;
						w.size = v.meta.size;
					} else console.log("end of array");
				}
				if (v)
					groups[variables.size].size += v.meta.size;
			}
		}
		// TODO : (4)
		const commands = [];
		// There are only 3 sizes for the address type: {BOOL:0.125, WORD:2, DWORD:4}
		const bools = groups[TYPE_SIZE.BOOL];
		const words = groups[TYPE_SIZE.WORD];
		const dwords = groups[TYPE_SIZE.DWORD];
		if (type === "write") {
			if (bools.random.length)
                commands.push({
					cmd: async function(self,args) {await self.client.randomWriteBits(args.bools); return true;},
					args: {bools: bools.random}
				});
			bools.blocks.forEach((w) => {
				commands.push({
					cmd: async function(self,args) {await self.client.batchWriteBits(args.bools); return true;},
					args: {bools: w}
				});
			});
			if (words.blocks.length)
				commands.push({
					cmd: async function(self,args) {await self.client.blockWrite(args.words,getCommandGroup()); return true;},
					args: {words: words.blocks}
				});
			// TODO : (5)
			dwords.blocks.forEach((w) => {dwords.random.push(...w);});
			dwords.random.size += dwords.blocks.size;
			dwords.random.buffer += dwords.blocks.buffer;
			if (words.random.length || dwords.random.length)
				commands.push({
					cmd: async function(self,args) {await self.client.randomWrite(args.words,args.dwords); return true;},
					args: {words: words.random, dwords: dwords.random}
				});
		} else {
			bools.random.forEach((w) => {
				console.log(`random bool : ${w.meta.name}`);
				b = getCommandGroup(w);
				b.size = 1;
				b.buffer = 2;
				bools.blocks.push(b);
				bools.blocks.size += 1;
				bools.blocks.buffer += 2;
			});
			if (words.blocks.length || bools.blocks.length)
				commands.push({
					cmd: async function(self,args) {await self.client.blockRead(args.words,args.bools); return true;},
					args: {words: words.blocks, bools: bools.blocks}
				});
			// TODO : (5)
			dwords.blocks.forEach((w) => {dwords.random.push(...w);});
			dwords.random.size += dwords.blocks.size;
			dwords.random.buffer += dwords.blocks.buffer;
			if (words.random.length || dwords.random.length)
				commands.push({
					cmd: async function(self,args) {await self.client.randomRead(args.words,args.dwords); return true;},
					args: {words: words.random, dwords: dwords.random}
				});
		}
		// if BIT, only random write and batch read
		group.cmd = commands;
		group.source = groups;
	}
	return result;
}

//---------------------------------------------------------------------------------------------------------------------
// EXPORTS

module.exports = {
	parseAllVariables: parseAllVariables,
	parseRules: parseRules
};
