#!/usr/bin/env python3
import xml.etree.ElementTree as ET
import json
import numpy as NP
import csv
import sys
from os import listdir
from os.path import isfile, join

SLMP_COMPATIBLE_DEVICES = {
    # Digital input outputs
    "X": {"code": 0x9C, "base": 16, "size": 0.125},
    "Y": {"code": 0x9D, "base": 16, "size": 0.125},
    # Bit addressed devices
    "M": {"code": 0x90, "base": 10, "size": 0.125},
    "L": {"code": 0x92, "base": 10, "size": 0.125},
    "F": {"code": 0x93, "base": 10, "size": 0.125},
    "V": {"code": 0x94, "base": 10, "size": 0.125},
    "B": {"code": 0xA0, "base": 16, "size": 0.125},
    # Word addressed devices
    "D": {"code": 0xA8, "base": 10, "size": 2},
    "W": {"code": 0xB4, "base": 16, "size": 2},
    # Special and direct access devices
    "SB": {"code": 0xA1, "base": 16, "size": 0.125},
    "SW": {"code": 0xB5, "base": 16, "size": 2},
    "SM": {"code": 0x91, "base": 10, "size": 0.125},
    "SD": {"code": 0xA9, "base": 10, "size": 0.125},
    "DX": {"code": 0xA2, "base": 16, "size": 0.125},
    "DY": {"code": 0xA3, "base": 16, "size": 0.125},
    "RD": {"code": 0x2C, "base": 10, "size": 2},
    # File and index access devices
    "R": {"code": 0xAF, "base": 10, "size": 2},
    "Z": {"code": 0xCC, "base": 10, "size": 2},
    "LZ": {"code": 0x62, "base": 10, "size": 4},
    "ZR": {"code": 0xB0, "base": 16, "size": 2},
    # Timers
    "TS": {"code": 0xC1, "base": 10, "size": 0.125},
    "TC": {"code": 0xC0, "base": 10, "size": 0.125},
    "TN": {"code": 0xC2, "base": 10, "size": 2},
    "LTS": {"code": 0x51, "base": 10, "size": 0.125},
    "LTC": {"code": 0x50, "base": 10, "size": 0.125},
    "LTN": {"code": 0x52, "base": 10, "size": 4},
    "CS": {"code": 0xC4, "base": 10, "size": 0.125},
    "CC": {"code": 0xC3, "base": 10, "size": 0.125},
    "CN": {"code": 0xC5, "base": 10, "size": 2},
    "LCS": {"code": 0x55, "base": 10, "size": 0.125},
    "LCC": {"code": 0x54, "base": 10, "size": 0.125},
    "LCN": {"code": 0x56, "base": 10, "size": 4},
    "STS": {"code": 0xC7, "base": 10, "size": 0.125},
    "STC": {"code": 0xC6, "base": 10, "size": 0.125},
    "STN": {"code": 0xC8, "base": 10, "size": 2},
    "LSTS": {"code": 0x59, "base": 10, "size": 0.125},
    "LSTC": {"code": 0x58, "base": 10, "size": 0.125},
    "LSTN": {"code": 0x5A, "base": 10, "size": 4}
}

TYPE_SIZE = {
	"BOOL": 0.125,
	"INT": 2,
	"DINT": 4,
	"WORD": 2,
	"DWORD": 4,
	"REAL": 4,
	"LREAL": 8,
	"string": 1,
	"wstring": 2
}

PLC_TO_GOT_TYPES = {
    'BOOL': 'Bit',
    'INT': 'Signed BIN16',
    'DINT': 'Signed BIN32',
    'WORD': 'Unsigned BIN16',
    'DWORD': 'Unsigned BIN32',
    'REAL': 'Real(32bit)',
    'LREAL': 'Real(64bit)',
    'string': 'Signed BIN16',
    'wstring': 'Signed BIN16',
}
UNSUPPORTED_TYPES = [
    'TIME', 'POINTER', 'TIMER', 'COUNTER', 'LCOUNTER',
    'RETENTIVETIMER', 'LRETENTIVETIMER', 'LTIMER'
]
PLC_TO_GOT_KEYS = {
    'name': 'Label Name',
    'type': 'Data Type',
    'address' : 'Assign (Device)',
    'comments': [
        'Comment','Comment2','Comment3','Comment4',
        'Comment5','Comment6','Comment7','Comment8',
        'Comment9','Comment10','Comment11','Comment12',
        'Comment13','Comment14','Comment15','Comment16']
}
CSV_KEYS = [
    'Label Name','Data Type','Assign (Device)',
    'Comment','Comment2','Comment3','Comment4',
    'Comment5','Comment6','Comment7','Comment8',
    'Comment9','Comment10','Comment11','Comment12',
    'Comment13','Comment14','Comment15','Comment16'
]
STRING_TYPE = 'INT'
COMMENT_SIZE = 16

IS_TEST = True
ENABLE_COMMENTS = False

NAME_JOINER = '_'
ARRAY_JOINER = '_'
COMMENT_JOINER = ' : '


def element_iterator ( element ) :
    if type( element ) == list :
        for el in element :
            for res in element_iterator ( el ) :
                yield res
    else :
        yield element


def _initial_value ( element ) :
    tree = element.find('initialValue')
    return tree[0].attrib.get('value',0) if tree is not None and len(tree) == 1 else 0

def _dimension_to_len ( dimension ) :
    length = 1
    for pair in dimension :
        length *= pair[1] - pair[0] + 1
    return length

class VarType :
    def getVarType ( tree, value=0, dimension=[] ) :
        if len(tree) != 1:
            raise Exception('VarType : xml : wrong tree length, there should be only one child')
        if tree[0].tag in PLC_TO_GOT_TYPES :
            return { 'type': tree[0].tag, 'dimension': dimension, 'value': VarType.getInitialValue(tree[0].tag, value), 'size': _dimension_to_len(dimension) }
        if tree[0].tag in UNSUPPORTED_TYPES :
            return { }
        match tree[0].tag:
            case 'wstring':
                if len(dimension) > 2:
                    raise Exception('VarType : wstring : unsupported dimension, strings takes up a dimension')
                return { 'type': tree[0].tag, 'dimension': dimension, 'value': value or '', 'size': int(tree[0].attrib.get('length')) }
            case 'string':
                if len(dimension) > 2:
                    raise Exception('VarType : string unsupported dimension, strings takes up a dimension')
                l = int(tree[0].attrib.get('length'))
                return { 'type': tree[0].tag, 'dimension': dimension, 'value': value or '', 'size': l+l%2 }
            case 'array':
                dimension = [ [ int(val) for val in dim.attrib.values() ] for dim in tree[0].findall( 'dimension' ) ]
                if len(dimension) > 3 or len(dimension) < 1 :
                    raise Exception('VarType : array : wrong dimension, must be between 1 and 3')
                return VarType.getVarType( tree[0].find( 'baseType' ), value, dimension )
            case 'derived':
                if tree[0].attrib['name'] in UNSUPPORTED_TYPES :
                    return { }
                return { 'type': tree[0].attrib['name'], 'dimension': dimension }
    def getInitialValue ( vartype='INT', value=0 ) :
        match vartype:
            case 'BOOL':
                return bool(value)
            case 'INT' | 'DINT' | 'WORD' | 'DWORD':
                return int(value)
            case 'REAL' | 'LREAL':
                return float(value)


class VarAddress :
    def getVarAddress ( tree ) :
        addr = [ ]
        for node in tree :
            match node.tag :
                case 'member' :
                    if 'address' in node.attrib :
                        addr.append( { 'name': node.attrib['name'], 'address': node.attrib['address'] } )
                    elif len(node) == 1 and node[0].tag == 'struct' :
                        addr.append( { 'name': node.attrib['name'], 'struct': VarAddress.getVarAddress( node[0] ) } )
                case 'array' :
                    # find the dimension of the array, like above for VarType
                    # populate the array if possible with the content of the tags "element"
                    if len(node) < 1 :
                        return { **node.attrib }
                    index = [ 0, 0, 0 ]
                    arr = [ ]
                    for el_0 in node :  # outer array ( 0 )
                        index[0] = int( el_0.attrib['index'] )
                        if el_0[0].tag != 'element' :
                            arr.append( [ {'index':index[:1],**v} for v in VarAddress.getVarAddress( el_0 ) ] )
                            continue
                        arr_1 = [ ]
                        for el_1 in el_0 :  # middle array ( 1 )
                            index[1] = int( el_1.attrib['index'] )
                            if el_1[0].tag != 'element' :
                                arr_1.append( [ {'index':index[:2],**v} for v in VarAddress.getVarAddress( el_1 ) ] )
                                continue
                            arr_2 = [ ]
                            for el_2 in el_1 :  # inner array ( 2 )
                                index[2] = int( el_2.attrib['index'] )
                                arr_2.append( [ {'index':index,**v} for v in VarAddress.getVarAddress( el_2 ) ] )
                            arr_1.append( arr_2 )
                        arr.append( arr_1 )
                    return arr
        return addr


class VarComments :
    def getVarComments ( tree, comment_list ) :
        for comment in tree.findall( 'comment' ) :
            comment_list[ int(comment.attrib['number']) - 1 ] = comment.find('html').text
        return comment_list


class VarStruct :
    def getAllVarStructs ( tree ) :
        structs = { }
        for node in tree :
            struct = node.find( 'baseType' ).find( 'struct' )
            temp_list = [ ]
            for var in struct.findall( 'variable' ) :
                # clean temp variables
                xml_comments = None
                # collect useful data nodes
                for dt in var.find( 'addData' ) :
                    if dt[0].tag == 'variableComments' :
                        xml_comments = dt[0]
                # get variable type
                temp_var = { 'name': var.attrib['name'], **VarType.getVarType(var.find('type'),_initial_value(var),[]) }
                if 'type' not in temp_var :
                    continue
                # get variable comments
                if ENABLE_COMMENTS :
                    temp_var[ 'comments' ] = [''] * COMMENT_SIZE
                    if xml_comments :
                        temp_var[ 'comments' ] = VarComments.getVarComments( xml_comments, temp_var[ 'comments' ] )
                temp_list.append( temp_var )
            structs[ node.attrib.get( 'name', '' ) ] = temp_list
        return structs
    def getVarStruct ( tree, typename ) :
        for node in tree:
            if node.attrib.get( 'name', '' ) == typename:
                struct = node.find( 'baseType' ).find( 'struct' )
                temp_list = [ ]
                for var in struct.findall( 'variable' ) :
                    # clean temp variables
                    xml_comments = None
                    # collect useful data nodes
                    for dt in var.find( 'addData' ) :
                        if dt[0].tag == 'variableComments' :
                            xml_comments = dt[0]
                    # get variable type
                    temp_var = { 'name': var.attrib['name'], **VarType.getVarType(var.find('type'),_initial_value(var),[]) }
                    if 'type' not in temp_var :
                        continue
                    # get variable comments
                    if ENABLE_COMMENTS :
                        temp_var[ 'comments' ] = [''] * COMMENT_SIZE
                        if xml_comments :
                            temp_var[ 'comments' ] = VarComments.getVarComments( xml_comments, temp_var[ 'comments' ] )
                    temp_list.append( temp_var )
                return temp_list
        return {}
    def getVarStructTree ( tree, structs, var ) :
        depth = 0
        if 'type' not in var :
            #print('ERROR : {}'.format(var))
            return 0
        if var[ 'type' ] in PLC_TO_GOT_TYPES :
            return 1
        elif var[ 'type' ] not in structs.keys() :
            #print( '{} : not found'.format(var['type']) )
            structs[ var['type'] ] = VarStruct.getVarStruct( tree, var['type'] )
        indices = [ dimension[1]-dimension[0]+1 for dimension in var[ 'dimension' ] ]
        if type( var.get('struct',None) ) == list :
            for temp_var in element_iterator( var['struct'] ) :
                found = False
                for temp_struct in structs[ var['type'] ] :
                    if temp_struct['name'] == temp_var['name']:
                        temp_var.update( temp_struct )
                        found = True
                        break
                if not found :
                    print( "ERROR : ({},{}) : {} : not found".format(var.get('name',''),var.get('type',''),temp_var.get('name','')) )
                else :
                    depth = max( depth, VarStruct.getVarStructTree ( tree, structs, temp_var ) )
        return depth + 1


def _load_by_nodetag ( filename, node_tag ):
    temp_tree = None
    with open( filename, 'r' ) as f :
        temp_tree = ET.fromstring( ''.join( f.readlines() ) )
    for element in temp_tree.iter( ) :
        element_tag = element.tag.split( '}' )
        element.tag = element_tag[1]
    result_tree = None
    for node in ET.fromstring( ET.tostring( temp_tree ) ).iter( ) :
        if node.tag == node_tag :
            result_tree = node
            break
    return result_tree

# Load XML removing namespaces
def load_labels ( filename ) :
    print(filename)
    return _load_by_nodetag(filename, "configuration")
def load_structs ( filename ) :
    return _load_by_nodetag(filename, "dataTypes")

# 
def to_dict ( labels_tree, structs_tree, labels_dict={} ) :
    structs_dict = VarStruct.getAllVarStructs( structs_tree )
    for ls in labels_tree :
        # ignore constant variables, they don't have an address
        is_retain = 'retain' in ls.attrib
        is_const = 'constant' in ls.attrib
        # prepare
        temp_list = [ ]
        if is_const :
            if not IS_TEST : 
                continue
            #print( 'analyzing constants')
        # iterate over variables
        for var in ls.findall( 'variable' ) :
            # clean temp variables
            is_access = False
            xml_struct = None
            xml_comments = None
            # collect useful data nodes
            for dt in var.find( 'addData' ) :
                match dt[0].tag:
                    case 'variableExternalDeviceAccess' :
                        if dt[0].attrib.get( 'isAccess' ) == 'true' :
                            is_access = True
                    case 'variableStructDeviceAssignment' :
                        xml_struct = dt[0]
                    case 'variableComments' :
                        #print('comments found for {}'.format(var.tag))
                        xml_comments = dt[0]
            # ignore without external access
            if not is_access :
                if not IS_TEST :
                    continue
                #print ( '{} : not accessible'.format( var.attrib[ 'name' ] ) )
            # get variable type
            temp_var = { 'name': var.attrib[ 'name' ], 'const': is_const, 'retain': is_retain, 'access': is_access,
                         **VarType.getVarType(var.find('type'),_initial_value(var),[]) }
            if 'type' not in temp_var :
                continue
            # get variable comments
            if ENABLE_COMMENTS :
                temp_var[ 'comments' ] = [''] * COMMENT_SIZE
                if xml_comments :
                    temp_var[ 'comments' ] = VarComments.getVarComments( xml_comments, temp_var[ 'comments' ] )
            # get variable address
            # get variable inner structure
            if xml_struct is not None :
                temp_var[ 'struct' ] = VarAddress.getVarAddress( xml_struct )
            else :
                temp_var[ 'address' ] = var.attrib.get( 'address', '' )
            # TODO : This must be a function, cause it will be recursive
            print( "{} : depth : {}".format(temp_var['name'], VarStruct.getVarStructTree( structs_tree, structs_dict, temp_var ) ))
            temp_list.append( temp_var )
        if ls.attrib['name'] not in labels_dict:
            labels_dict[ls.attrib['name']] = []
        labels_dict[ls.attrib['name']].extend( temp_list )
    return labels_dict


def to_list_iter ( in_vars, out_vars, template ) :
    for var in element_iterator( in_vars ) :
        row = { **template }
        if 'index' in var :
            row[ PLC_TO_GOT_KEYS['name'] ] += ARRAY_JOINER.join( [ str(i) for i in var.get('index',[]) ] ) + NAME_JOINER
        row[ PLC_TO_GOT_KEYS['name'] ] += var['name']
        for i,comment in enumerate(var['comments']) :
            row[ PLC_TO_GOT_KEYS['comments'][i] ] += comment
        if 'struct' in var :
            row[ PLC_TO_GOT_KEYS['name'] ] += NAME_JOINER
            for i,comment in enumerate(var['comments']) :
                if len(comment) > 0 :
                    row[ PLC_TO_GOT_KEYS['comments'][i] ] += COMMENT_JOINER
            to_list_iter ( var['struct'], out_vars, row )
        else :
            row[ PLC_TO_GOT_KEYS['type'] ] = PLC_TO_GOT_TYPES[ var['type'] ]
            temp_dimension = var['dimension']
            if var['type'] == 'string' :
                temp_dimension.append([0,var['size']/2-1])
            elif var['type'] == 'wstring' :
                temp_dimension.append([0,var['size']-1])
            if len(temp_dimension) > 0 :
                row[ PLC_TO_GOT_KEYS['type'] ] += '[{0}]'.format(
                    ','.join([ '{0}..{1}'.format(*pair) for pair in temp_dimension ]) )
            row[ PLC_TO_GOT_KEYS['address'] ] = var['address']
            out_vars.append( row )


def to_list ( labels_dict ) :
    labels_result = { }
    for k, l in labels_dict.items() :
        labels_list = [ ]
        template = { PLC_TO_GOT_KEYS['name'] : '' }
        for key in PLC_TO_GOT_KEYS['comments'] :
            template[ key ] = ''
        to_list_iter ( l, labels_list, template )
        labels_result[k] = labels_list
    return labels_result


def to_csv ( index, name, labels_list ) :
    with open ( name + '.csv', 'w', newline='' ) as output_file:
        output_file.write( '{0},{1}\n,"{2}"\n\n'.format( index, name, '' ) )
        output_file.write( ',"{}"\n'.format( '","'.join(CSV_KEYS) ) )
        for label in labels_list :
            output_file.write( ',"{}"\n'.format( '","'.join( [ label[key] for key in CSV_KEYS ] ) ) )


def decode_address ( var ) :
    result = { 'source': var['address'] }
    try :
        for i, c in enumerate( var['address'] ) :
            if c.isnumeric() :
                dev_type = var['address'][:i]
                if dev_type not in SLMP_COMPATIBLE_DEVICES :
                    #print('not supported device type')
                    break
                result['type'] = dev_type
                result['code'] = SLMP_COMPATIBLE_DEVICES[dev_type]['code']
                dev_addr = var['address'][i:]
                if '.' in dev_addr :
                    dev_addr, dev_sub = dev_addr.split('.')
                    result['sub'] = int(dev_sub,16)
                result['index'] = int(dev_addr,SLMP_COMPATIBLE_DEVICES[dev_type]['base'])
                result['size'] = SLMP_COMPATIBLE_DEVICES[dev_type]['size']
                break
    except BaseException as ex :
        print(ex)
        print(var['address'])
    return result

def decode_type ( var ) :
    # TODO : By exporting the labels i should also get the offset of the datatype, here i should use that as "type.size"
    return { 'source': var['type'], 'size': TYPE_SIZE.get(var['type'],-1) }

def to_json_iter ( in_vars, out_vars ) :
    for var in in_vars :
        if type( var ) == list :
            temp_list = [ ]
            to_json_iter( var, temp_list )
            out_vars.append( temp_list )
        else:
            temp = { **var }
            if 'address' in var :
                temp['address'] = decode_address( var )
            if 'struct' in var :
                temp_struct = [ ]
                to_json_iter ( var['struct'], temp_struct )
                temp['struct'] = temp_struct
            if 'type' in var :
                temp['type'] = decode_type( var )
            out_vars.append( temp )


def to_json ( labels_dict ) :
    dict_result = { }
    for k, l in labels_dict.items() :
        print(k)
        temp_list = [ ]
        to_json_iter( l, temp_list )
        dict_result[k] = temp_list
    return dict_result


def test ( ) :
    test = load('cmc_ws/xml/testl.xml','cmc_ws/xml/tests.xml')
    labs,strs = to_dict(*test)
    res = to_list( labs )
    to_csv( 1, 'TestLabel',res['TestLabel'])


# TODO : Quando ho un array devo spostare alcuni dettagli a monte e lasciare dentro struct sempre l'organizzazione ad array multilivello
'''
{
    "name": "array_struct_",
    "type": "test_struct",
    "size": [
        [
            0,
            1
        ],
        [
            0,
            1
        ]
    ],
    "address": "",
    "struct": [
        {
            "array": [],  # questo si toglie perché è uguale a struct ma multilivello
            "size": [],  # questo si toglie perchè sarebbe uguale a quello sopra
            "wordAddress": "D100",  # questo va a monte
            "bitAddress": "M100"  # questo va a monte
        }
    ]
}
'''

if __name__=="__main__":
    labs = {}
    structs_tree = load_structs( join(sys.argv[1],"sdt.xml") )
    for filename in listdir(sys.argv[1]):
        print(filename)
        if not filename.endswith(".xml") or filename == "sdt.xml":
            continue
        print("keep")
        labels_tree = load_labels( join(sys.argv[1],filename) )
        labs = to_dict(labels_tree, structs_tree, labs)
        print("done")
    dict_result = to_json(labs)
    with open ( join(sys.argv[1],"labels.json"), 'w' ) as output_file:
        json.dump( dict_result, output_file, indent=4 )
