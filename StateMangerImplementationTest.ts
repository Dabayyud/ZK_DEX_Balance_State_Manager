
/**
 * THIS IS A DIRTY FILE USED IN DEVELOPMENT OF THE STATE MANAGER
 * IT HAS MANY COMMENTS USED FOR PERSONAL REFERENCE
 * SOME COMMENTS OR PROBABLY MOST OF THEM ARE UNCLEAR BUT THEY WERE TO ME
 * I WILL CREATE A WEBSITE/README SHOWCASING HOW IT WORKS IN DEPTH
 */

import { ChildNodes, SMT, Node} from "@zk-kit/smt";
import { poseidon2 } from "poseidon-lite";
import { checksumAddress } from "viem";


type BalanceState = {
    available: bigint,
    locked: bigint
}

type AccountState = {
    nonce: bigint,
    balances: Map<`0x${string}`, BalanceState>;
}

type AccountUpdate = {
    user: `0x${string}`,
    account: AccountState
}

type Updates = [bigint, bigint]

const AccountMap = new Map<bigint, AccountState>();
const AccountRootHistory: Node[] = []
const ACCOUNT_HASH_DOMAIN: bigint = 1n
const SNARK_FIELD: bigint = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MOCK_USER: `0x${string}` = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const WETH_ADDRESS: `0x${string}` = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

const hash = (childNode: ChildNodes): bigint => {
    const [key, value] = childNode
    return poseidon2([BigInt(key), BigInt(value)])
}

const accountSMT = new SMT(hash, true)

function convertToBigInt(value: string | number | bigint): bigint {
    return BigInt(value) % SNARK_FIELD;
}

function normalizeAddress(addr: `0x${string}`) {
    return checksumAddress(addr)
}

function accountKey(user: `0x${string}`): bigint {
    return poseidon2([
        ACCOUNT_HASH_DOMAIN, convertToBigInt(normalizeAddress(user))
    ])
}

function accountLeafHash(account: AccountState): bigint {
    let balancesHash = 0n
    for (const [token, balances] of account.balances) {
        const tokenHash = poseidon2([
            convertToBigInt(normalizeAddress(token)),
            poseidon2([convertToBigInt(balances.available), convertToBigInt(balances.locked)])
        ])
        balancesHash = poseidon2([balancesHash, tokenHash])
    }
    return poseidon2([account.nonce, balancesHash])
}

function getUserState(key: bigint): AccountState {
    return AccountMap.get(key)!
}

function executeBatchAccountUpdates(updates: AccountUpdate[]): Updates[] {
    const batch: Updates[] = []
    const pendingSmtUpdates = new Map<bigint, bigint>()

    for (const u of updates) {
        const key = accountKey(u.user)
        const leaf = accountLeafHash(u.account)
        AccountMap.set(key, u.account)
         // only last transaction is used to update the SMT for the specific user
        batch.push([key, leaf]) // this is okay as we treat this stateManager as a settler, not an intermediate model
    }

    for (const [key, leaf] of pendingSmtUpdates) {
        if(!accountSMT.get(key)) {
            accountSMT.add(key, leaf)
        }
        else{accountSMT.update(key, leaf)}
    }
    AccountRootHistory.push(accountSMT.root)
    return batch;
}

function incrementUserNonce(user: `0x${string}`) {
    const key = accountKey(user)
    if (!AccountMap.has(key)) {
        AccountMap.set(key, {
            nonce: 0n,
            balances: new Map<`0x${string}`, BalanceState>()
        })
    }
    const account = AccountMap.get(key)!
    account.nonce += 1n
}

// HELPER FUNCTION FOR TESTING
function seedGlobalAccount(user: `0x${string}`, token:`0x${string}`, available: bigint, locked: bigint, nonce: bigint) {
    const key = accountKey(user)
    const balances = new Map<`0x${string}`, BalanceState>();
    balances.set(token, {
        available: available,
        locked: locked,
    })
    const account: AccountState = {
        nonce: nonce,
        balances: balances
    }
    const leaf = accountLeafHash(account)
    if (!AccountMap.has(key)) {accountSMT.add(key, leaf)}
    else {accountSMT.update(key, leaf)}
    AccountMap.set(key, account)

    AccountRootHistory.push(accountSMT.root)
    console.log("---------------------------------------------------------------------------------------------")
    console.log(`SEEDER USER ADDRESS IS ${convertToBigInt(user)}`)
    console.log("---------------------------------------------------------------------------------------------")
    console.log(`New Root: ${convertToBigInt(accountSMT.root)}`)
}

function seedGlobalAccount2(user: `0x${string}`, token:`0x${string}`, available: bigint, locked: bigint, nonce: bigint) {
    const key = accountKey(user)
    const balances = new Map< `0x${string}`, BalanceState>();
    balances.set(token, {
        available: available,
        locked: locked
    })
    const account: AccountState = {
        nonce: nonce,
        balances: balances
    }
    const leaf = accountLeafHash(account)
    if(!AccountMap.has(key)){accountSMT.add(key, leaf)}
    else{accountSMT.update(key, leaf)}
    AccountMap.set(key, account)
}


// TESTING

// seedGlobalAccount(MOCK_USER, WETH_ADDRESS, 10n, 0n, 0n)
// seedGlobalAccount(MOCK_USER, WETH_ADDRESS, 10n, 3n, 0n)
// incrementUserNonce(MOCK_USER)
// const key = accountKey(MOCK_USER)
// console.log(AccountMap.get(key)!.nonce) // 1n 

const key = accountKey(MOCK_USER)

const update1: AccountUpdate[] =  [
    {
        user: MOCK_USER,
        account: {
            nonce: 1n,
            balances: new Map ([
                [
                    WETH_ADDRESS,
                    {available: 100n, locked: 0n}
                ]
            ])
        }
    }
]

executeBatchAccountUpdates(update1)

const currentAccount = AccountMap.get(key) || {nonce: 0n, balances: new Map<`0x${string}`, BalanceState>()}
const newBalances = new Map(currentAccount.balances) // Obtaining the main object 
const existingWeth: BalanceState = newBalances.get(WETH_ADDRESS) || {available: 0n, locked: 0n} // querying the data 

// IMMUTABILTY PRINCIBLES 

newBalances.set(WETH_ADDRESS, {
    ...existingWeth, // assigning a copy of that data over here to maintain immutability
    available: existingWeth.available + 50n
})

const update2: AccountUpdate[] = [
    {
        user: MOCK_USER,
        account: {
            nonce: AccountMap.get(key)!.nonce + 1n,
            balances: newBalances
        }
    }
]

executeBatchAccountUpdates(update2)


const currentAccount2 = AccountMap.get(key) || {nonce: 0n, balances: new Map<`0x${string}`, BalanceState>()}
const newBalances2 = new Map(currentAccount2.balances) // Obtaining the main object 
const existingWeth2: BalanceState = newBalances2.get(WETH_ADDRESS) || {available: 0n, locked: 0n} // querying the data 

newBalances2.set(WETH_ADDRESS, {
    ...existingWeth2,
    available: existingWeth2.available! + 50n // should now return 200n (150n + 50n)
})

const update3: AccountUpdate[] = [
    {
        user: MOCK_USER,
        account: {
            nonce: AccountMap.get(key)!.nonce + 1n,
            balances: newBalances2
        }
    }
]

executeBatchAccountUpdates(update3)


console.log(AccountMap.get(key)!.balances.get(WETH_ADDRESS)!.available)

// "User can still resubmit a transaction if the key is deleted as the nonce is still set to one." That has been fixed by creating a deletedUsers array that stores the latest used nonce.
// Reason we use a state mapping is to allow our engine fast access to user asscociated info
// I'll have to redefine my nonce so that it shows "which state transition it is in" not "how many times is balance updated" -- done 
// My execute batch function is passing in a full AccounState for every update and overwriting it. In reality this is redundant and a better alternative would be passing in the user amount and token