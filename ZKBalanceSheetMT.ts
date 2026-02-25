import { SMT, ChildNodes } from "@zk-kit/smt"
import { poseidon2, poseidon3, poseidon4} from "poseidon-lite"
import { checksumAddress } from "viem"

interface proof {
    entry: [bigint, bigint],
    matchingEntry: undefined | bigint,
    siblings: [],
    root: bigint,
    membership: boolean
}

const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

const hash = (childNode: ChildNodes): bigint => {
    const [left, right] = childNode
    return poseidon2([BigInt(left), BigInt(right)])
}

const tree = new SMT(hash, true);
// console.log(tree.root) //0n

function convertToBigInt(value: string | number | bigint) {
    return BigInt(value) % SNARK_FIELD
}

function normalizeAddress(addr: `0x${string}`) {
    return checksumAddress(addr)
} 

function keyHash(user: `0x${string}`, token: `0x${string}`, nonce: number | bigint) {
    return poseidon4([1n, convertToBigInt(normalizeAddress(user)), convertToBigInt(normalizeAddress(token)), convertToBigInt(nonce)])
}

function leafHash(token: `0x${string}`, balance: string | bigint | number) {
    return poseidon3([2n, convertToBigInt(normalizeAddress(token)), convertToBigInt(balance)])
}

function addUserBalances(user:`0x${string}`, nonce: number | bigint, token: `0x${string}`, balance: string | bigint | number) {
    const key = keyHash(user, token, nonce);
    const leaf = leafHash(token, balance);
    tree.add(key, leaf)
}

function modifyUserBalances(user: `0x${string}`, nonce: number | bigint, token: `0x${string}`, balance: string | bigint | number) {
    const key = keyHash(user, token, nonce);
    const leaf = leafHash(token, balance)
    tree.update(key, leaf)
}

function getKeyValue(user: `0x${string}`, token: `0x${string}`, nonce: number | bigint): bigint {
    return keyHash(user, token, nonce)
}


//TESTING

addUserBalances("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 6769, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 675)
console.log(tree.root) // 5094740996383503611190854328172798792261891385731069460962233325201846190252n

modifyUserBalances("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 6769, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 256)
console.log(tree.root) // 7718970902825666896841898858944589151448811494143236235494901992168102264562n

const key = getKeyValue("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  6769) // VALID PROOF
const invalidKey = getKeyValue("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92267", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C76Cc2", 6769) // INVALID PROOF

const value = tree.get(key)
console.log(value) // 902871590340992852212296676329639239555221284486321140817890123897464287704n

const invalidValue = tree.get(invalidKey)
console.log(invalidValue) // UNDEFINED

const createValidProof = tree.createProof(key) as proof
console.log(createValidProof.membership) // TRUE

const createInvalidProof = tree.createProof(invalidKey) as proof 
console.log(createInvalidProof.membership) // FALSE

