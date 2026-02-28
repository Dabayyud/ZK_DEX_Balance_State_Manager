import { SMT, ChildNodes, Node } from "@zk-kit/smt"
import { poseidon2, poseidon3} from "poseidon-lite"
import { checksumAddress } from "viem"

interface proof {
    entry: [bigint, bigint],
    matchingEntry: undefined | bigint,
    siblings: [],
    root: bigint,
    membership: boolean
} // Not needed for this stage

interface UserState {
    balance: bigint,
    nonce: bigint,
}

type Updates = [bigint, bigint]

const stateMap = new Map<bigint, UserState>();
const deletedUsers = new Map<bigint, bigint>();

const rootHistory: Node[] = []

const SNARK_FIELD: bigint = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const KEY_HASH_DOMAIN: bigint = 1n

const hash = (childNode: ChildNodes): bigint => {
    const [key, value] = childNode;
    return poseidon2([BigInt(key), BigInt(value)]); // Dependancy Injection
}

const tree = new SMT(hash, true)

function convertToBigInt(value: string | number | bigint): bigint {
    return BigInt(value) % SNARK_FIELD; // Poseidon only takes bigint values as input
}

function normalizeAddress(addr: `0x${string}`): `0x${string}` {
    return checksumAddress(addr); // Hashing is case sensitive so every address is passed through this helper
}

function keyHash(user:`0x${string}`, token: `0x${string}`): bigint {
    return poseidon3([KEY_HASH_DOMAIN, convertToBigInt(normalizeAddress(user)), convertToBigInt(normalizeAddress(token))]);
} // Returns the key hash (user&token) and is used as in index that points to a value

function leafHash(balance: bigint | number | string, nonce: bigint | number | string): bigint {
    return poseidon2([convertToBigInt(balance), convertToBigInt(nonce)]);
} // Returns the leaf hash (balance&bigint) and is the asscoiated value

function addUserBalances(user:`0x${string}`, token: `0x${string}`, balance: bigint | number | string) {
    const key = keyHash(user, token);
    if (!stateMap.has(key)) { // checks to see if the key exists, if false will add a key.
        stateMap.set(key, {balance: convertToBigInt(balance), nonce: 0n})
        tree.add(key, leafHash(balance, 0n))
        return;
    }
    const currentState: UserState = getUserState(user, token); 
    const nonce = currentState.nonce
    const newBalance = currentState.balance + convertToBigInt(balance)

    stateMap.set(key, {
        balance: newBalance,
        nonce: nonce
    })

    const newLeaf = leafHash(balance, nonce);
    tree.update(key, newLeaf) // This function will not be called by engine so it is not a tx. Therefore nonce is not incremented

} // Function used during development, or can be used as a onlyOwner function. The nonce he is purposely not incremented as it will not be a transaction facilitated by the engine. 

function getUserState(user:`0x${string}`, token:`0x${string}`): UserState {
    const key = keyHash(user, token);
    return stateMap.get(key)! // This function is only called after checking if key exists so it will never revert undefined
}

function executeSingleTradeUpdate(user:`0x${string}`, token:`0x${string}`, balance: bigint | number | string) {
    const key = keyHash(user, token);

    if (!stateMap.has(key)) {
        tree.add(key, leafHash(balance, 1n))
        stateMap.set(key, {
            balance: convertToBigInt(balance),
            nonce: 1n
        })
        rootHistory.push(tree.root)
        return;
    }

    const currentState: UserState = getUserState(user, token);
    const newNonce = currentState.nonce + 1n 

    const newLeaf = leafHash(balance, newNonce);
    tree.update(key, newLeaf);
    rootHistory.push(tree.root)

    stateMap.set(key, {
        balance: convertToBigInt(balance),
        nonce: newNonce
    });
}

function executeBatchUpdates(updates: {user:`0x${string}`, token:`0x${string}`, balance: bigint | number | string}[]): Updates[] {
    const batch: Updates[] = []

    for (const u of updates) {
        const key = keyHash(u.user, u.token)
        const isNewUser = !stateMap.has(key)
        const isDeletedUser = deletedUsers.has(key)

        const currentNonce = (isNewUser ? 0n : isDeletedUser ? deletedUsers.get(key)! : stateMap.get(key)!.nonce) // Nested ternary 

        const newNonce = currentNonce + 1n 

        const newLeaf = leafHash(u.balance, newNonce)

        if (isNewUser) {
            tree.add(key, newLeaf)
        }
        else {
            tree.update(key, newLeaf)
        }

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

function deleteKey(user: `0x${string}`, token:`0x${string}` ) {
    const key = keyHash(user, token)
    if (!stateMap.has(key)) {
        return;
    }
    const currentNonce = stateMap.get(key)!.nonce
    deletedUsers.set(key, currentNonce)
    tree.delete(key)
    stateMap.delete(key)
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

console.log(userState3.balance,",", userState3.nonce) // 1500, 1n

const key = keyHash("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")
const proof = tree.createProof(key)
const verified: boolean = tree.verifyProof(proof)
console.log(verified) // TRUE
console.log(proof.membership) // TRUE

deleteKey("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")

const proof2 = tree.createProof(key)
const verified2: boolean = tree.verifyProof(proof2);
console.log(verified2) // TRUE 
console.log(proof2.membership) // FALSE

const userState4 = getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") as UserState; // Should return undefined as key is deleted

// console.log(userState4.balance,",", userState4.nonce) // 1500, 1n

executeBatchUpdates([
    {user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", balance: 650},
    {user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92262", token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", balance: 220}
])

console.log(
    getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")) // 650, 1n, since we deleted the key

console.log(
    getUserState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92262", 
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")) // 220, 1n // Even though key does not exist, it should still increment nonce by one as it is a transaction (called by our engine)

const history = getRootHistory()
console.log(history) /**
[
  9716220047687929135084344709790322372265180280421306796740815673652389610428n,
  73213594256254899049289679537305119305340938654512694505830836194824227252n
]
 */
console.log(tree.root) // 73213594256254899049289679537305119305340938654512694505830836194824227252n

// User can still resubmit a transaction if the key is deleted as the nonce is still set to one.


