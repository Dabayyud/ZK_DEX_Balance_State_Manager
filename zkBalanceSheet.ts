import { SMT, ChildNodes, Node } from "@zk-kit/smt"
import { poseidon2, poseidon3} from "poseidon-lite"
import { checksumAddress } from "viem"

interface proof {
    entry: [bigint, bigint],
    matchingEntry: undefined | bigint,
    siblings: [],
    root: bigint,
    membership: boolean
}

interface UserState {
    balance: bigint,
    nonce: bigint,

}
type Updates = [bigint, bigint]

const stateMap = new Map<bigint, UserState>();
const rootHistory: Node[] = []


const SNARK_FIELD: bigint = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const KEY_HASH_DOMAIN: bigint = 1n

const hash = (childNode: ChildNodes): bigint => {
    const [key, value] = childNode;
    return poseidon2([BigInt(key), BigInt(value)]); // Dependancy Injection
}

const tree = new SMT(hash, true)

function convertToBigInt(value: string | number | bigint) {
    return BigInt(value) % SNARK_FIELD;
}

function normalizeAddress(addr: `0x${string}`) {
    return checksumAddress(addr);
}

function keyHash(user:`0x${string}`, token: `0x${string}`): bigint {
    return poseidon3([KEY_HASH_DOMAIN, convertToBigInt(normalizeAddress(user)), convertToBigInt(normalizeAddress(token))]);
}

function leafHash(balance: bigint | number | string, nonce: bigint | number | string): bigint {
    return poseidon2([convertToBigInt(balance), convertToBigInt(nonce)]);
}

function addUserBalances(user:`0x${string}`, token: `0x${string}`, balance: bigint | number | string) {
    const key = keyHash(user, token);
    if (!stateMap.has(key)) {
        stateMap.set(key, {balance: convertToBigInt(balance), nonce: 1n})
        tree.add(key, leafHash(balance, 1n))
        return;
    }
    const currentState: UserState = getUserState(user, token);
    const newNonce = currentState.nonce + 1n
    const newBalance = currentState.balance + convertToBigInt(balance)

    stateMap.set(key, {
        balance: newBalance,
        nonce: newNonce
    })

    const newLeaf = leafHash(balance, newNonce);
    tree.update(key, newLeaf)
}

function getUserState(user:`0x${string}`, token:`0x${string}`): UserState {
    const key = keyHash(user, token);
    return stateMap.get(key) || {balance:0n, nonce:0n}
}

function executeSingleTradeUpdate(user:`0x${string}`, token:`0x${string}`, balance: bigint | number | string) {
    const key = keyHash(user, token);

    if (!stateMap.has(key)) {
        tree.add(keyHash(user, token), leafHash(balance, 1n))
        stateMap.set(key, {
            balance: convertToBigInt(balance),
            nonce: 1n
        })
        rootHistory.push(tree.root)
        return;
    }

    rootHistory.push(tree.root)
    const currentState: UserState = getUserState(user, token);
    const newNonce = currentState.nonce + 1n 

    const newLeaf = leafHash(balance, newNonce);
    tree.update(key, newLeaf);

    stateMap.set(key, {
        balance: convertToBigInt(balance),
        nonce: newNonce
    });
}

function executeBatchUpdates(updates: {user:`0x${string}`, token:`0x${string}`, balance: bigint | number | string}[]): Updates[] {
    const batch: Updates[] = []

    for (const u of updates) {
        const key = keyHash(u.user, u.token)
        if(!stateMap.has(key)) {
            tree.add(keyHash(u.user, u.token), leafHash(u.balance, 0n))
        }
        const currentState: UserState = getUserState(u.user, u.token)
        const newNonce = currentState.nonce + 1n
        const newLeaf = leafHash(u.balance, newNonce)

        stateMap.set(key, {
            balance: convertToBigInt(u.balance),
            nonce: newNonce
        })
        batch.push([key, newLeaf])
    }
    rootHistory.push(tree.root)
    return batch;
}

function getRootHistory() {
    const history = []
    for (let i = 0; i < rootHistory.length; i++) {
        history.push(rootHistory[i]) 
    } 
    return history
}

// TESTING
addUserBalances("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 1000)
const userState = getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") as UserState;

console.log(userState.balance,",",userState.nonce) // 1000n, 0n

executeSingleTradeUpdate("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 500)
const userState2 = getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") as UserState

console.log(userState2.balance,",",userState2.nonce) // 500n, 1n

addUserBalances("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 1000);
const userState3 = getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") as UserState;

console.log(userState3.balance,",", userState3.nonce) // 1500, 2n

const key = keyHash("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
const proof = tree.createProof(key)
const verified: boolean = tree.verifyProof(proof)
console.log(verified) // TRUE
console.log(proof.membership) // TRUE

tree.delete(key)
const proof2 = tree.createProof(key)
const verified2: boolean = tree.verifyProof(proof2);
console.log(verified2) // TRUE 
console.log(proof2.membership) // FALSE

const userState4 = getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") as UserState;

console.log(userState4.balance,",", userState4.nonce) // 1500, 2n

executeBatchUpdates([
    {user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", balance: 650},
    {user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92262", token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", balance: 220}
])

console.log(
    getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")) // 650, 3n

console.log(
    getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92262", 
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")) // 220, 1n

const history = getRootHistory()
console.log(history) /**
[
  10120964854758787464047532211695533346706019617791029063305741967966091649056n,
  1002465649616254263797890123061372875508093719219657127212476118664986671678n
]
 */

console.log(tree.root) // 1002465649616254263797890123061372875508093719219657127212476118664986671678n


