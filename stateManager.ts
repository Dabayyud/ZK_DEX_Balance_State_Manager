import { SMT, ChildNodes, Node } from "@zk-kit/smt"
import { poseidon2, poseidon3} from "poseidon-lite"
import { checksumAddress } from "viem"
import { Account } from "viem/tempo";


export interface UserState {
    available: bigint, // User can trade with this amount
    locked: bigint // The reserved funds for open/unexec
}

const SNARK_FIELD: bigint = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
// This is the hash of the string 'INITIAL_BALANCE_SEED', to prove that there is no trust gap.
const INITIAL_BALANCE_SEED = 1386762397127204430154060938662991001550975618419616053335272040003023023027n;
const ACCOUNT_SMT_HASH_DOMAIN: bigint = 1n


type Updates = [bigint, bigint]

type AccountUpdate = {
    user: `0x${string}`,
    account: AccountState
}

type BalanceState = {
    available: bigint,
    locked: bigint
}

type AccountState = {
    nonce: bigint,
    balances: Map<string, BalanceState>
}

export class StateManager {

    private accountMap = new Map<bigint, AccountState>();
    private accountRootHistory: Node[] = []

    constructor (private accountSMT: SMT) {
        this.accountSMT = accountSMT
    }

    convertToBigInt(value: string | number | bigint): bigint {
        return BigInt(value) % SNARK_FIELD;
    }

    private normalizeAddress(addr: `0x${string}`) {
        return checksumAddress(addr)
    }

    private sortedTokens(balance: Map<string, BalanceState>): string[] {
        return Array.from(balance.keys()).sort((a, b) => // nlog(n) but nevermind because token lists is small.
            BigInt(a) < BigInt(b) ? - 1 : 1
        );
    }

    accountKey(user: `0x${string}`): bigint {
        return poseidon2([
            ACCOUNT_SMT_HASH_DOMAIN, this.convertToBigInt(this.normalizeAddress(user))
        ])
    }

    private accountLeafHash(account: AccountState): bigint {
        let balancesHash = INITIAL_BALANCE_SEED
        const sortedTokens = this.sortedTokens(account.balances)
        for (const token of sortedTokens) {
            const state = account.balances.get(token)!
            const tokenHash = poseidon3([
                this.convertToBigInt(token),
                this.convertToBigInt(state.available),
                this.convertToBigInt(state.locked)
            ])
            balancesHash = poseidon3([ACCOUNT_SMT_HASH_DOMAIN, balancesHash, tokenHash])
        }
        return poseidon2([account.nonce, balancesHash])
    }

    executeBatchAccountUpdates(updates: AccountUpdate[]): Updates[] {
        const batch: Updates[] = []
        const pendingSmtUpdates = new Map<bigint, bigint>()

        for (const u of updates) {
            const key = this.accountKey(u.user)
            const leaf = this.accountLeafHash(u.account)

            this.accountMap.set(key, u.account)
            batch.push([key, leaf])
        }
        for (const [key, leaf] of pendingSmtUpdates) {
            if(!this.accountSMT.get(key)) {this.accountSMT.add(key, leaf)}
            else{this.accountSMT.update(key, leaf)}
        }
          this.accountRootHistory.push(this.accountSMT.root)
          return batch;
    }

    incrementUserNonce(user: `0x${string}`) {
        const account = this.getAccount(user)
        account.nonce += 1n
    }

    getAccount(user: `0x${string}`): AccountState {
        const key = this.accountKey(user)
        if(!this.accountMap.has(key)){
            this.accountMap.set(key, {
                nonce: 0n,
                balances: new Map<`0x${string}`, BalanceState>()
            })
        }
        return (this.accountMap.get(key))!
    }

    getAccountSMTHistory(): (string | bigint)[] {
        const history = []
        for (let i = 0; i < this.accountRootHistory.length; i++) {
            history.push(this.accountRootHistory[i])
        }
        return history
    }
}
// root structure should include both SMT's, execute trade batches should also push roots
// should make incrementNonce and getNonce public so trade engine can read them 

// CURRENT SMT (user, token) (balance, locked), (user) (nonce)
// PROPOSED IDEA (user) (nonce, balance(tokenID)).
// Created a merkle tree that takes key (user) and leaf (account type). This account type takes parameters nonce and account a balances mapping which maps a token to its balances (which conitains type BalanceState that takes parameters available and locked). It is done by running a sequential for loop (using the previous hash of token and its balanceState) for the next cycle until all tokens have been complete. This way, we effectively generate proof using a single merkle tree.
