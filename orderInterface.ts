import { SMT, ChildNodes, Node } from "@zk-kit/smt"
import { poseidon2, poseidon3} from "poseidon-lite"
import { checksumAddress } from "viem"

type binary = 1 | 0

export interface LimitOrder {
    user: `0x${string}`;
    bToken: `0x${string}`; // 1
    sToken: `0x${string}`; // 0
    amount: bigint;
    price: bigint; // for matching logic
    nonce: bigint; 
    signature: string;
    side: binary; // 1 for buy, 0 for sell
    filled: bigint;
}


type BalancesState = {
    available: bigint,
    locked: bigint
}

export type AccountUpdates = {
    user: `0x${string}`,
    account: AccountState
}

export interface AccountState {
    nonce: bigint,
    balances: Map<string, BalancesState>
}

export interface BalanceState {
    user: `0x${string}`
    token: `0x${string}`
    available: bigint,
    locked: bigint
}

