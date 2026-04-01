import { checksumAddress } from "viem";
import { recoverTypedDataAddress } from "viem";
import { LimitOrder } from "./orderInterface";
import { privateKeyToAccount } from "viem/accounts";
import { toHex } from "viem";
import { recoverMessageAddress } from "viem";

const domain = {
    name: "ZK DEX",
    version: "1.0",
    chainId: 1,
    verifyingContract: "0x0000000000000000000000000000000000000000"
} as const ;

(async() => {
    const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
    const message = "transfer 20 tokens to ..."
    const signature = await account.signMessage({
        message: {raw: toHex(message)}
    })
    const recoveredAddress = await recoverMessageAddress({
        message: {raw: toHex(message)},
        signature: signature
    })
    console.log(account.address === recoveredAddress)
})(); // TRUE, testing the implementation.

const types = {
    LimitOrder: [
        { name: 'user', type: 'address' },
        { name: 'bToken', type: 'address' },
        { name: 'sToken', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'price', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'side', type: 'uint8' },
    ]
} as const;

export class ValidationGuard {
    async isOrderValid(order: LimitOrder): Promise<boolean> {
        const recoveredAddress = await recoverTypedDataAddress({
            domain,
            types, 
            primaryType: 'LimitOrder',
            message: order,
            signature: order.signature as `0x{string}`
        })
        return (checksumAddress(recoveredAddress).toLowerCase() === checksumAddress(order.user).toLowerCase())
    }
}

type orderType = {
    user: `0x${string}`
    bToken: `0x${string}`, 
    sToken: `0x${string}`,
    amount: bigint,
    price: bigint,
    nonce: bigint,
    side: number
}

const order1 = {
    user:  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
    bToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`,
    sToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as `0x${string}`,
    amount: 100n,
    price: 10000n,
    nonce: 0n,
    side: 1
}

async function isValid(order: orderType) {

    const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")

    const signature = await account.signTypedData({
        domain, 
        types,
        primaryType: 'LimitOrder',
        message: order
    })

    const recoveredAddress = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: 'LimitOrder',
        message: order,
        signature: signature
    })
    return (checksumAddress(recoveredAddress).toLowerCase() === checksumAddress(order.user).toLowerCase())
}

isValid(order1) // TRUE 






