import { OrderBook } from "./OrderBook";
import { AccountState, LimitOrder } from "./orderInterface";
import { StateManager } from "./stateManager";
import { AccountUpdates } from "./orderInterface";

export class TradeEngine {

    constructor(private orderBook: OrderBook, private stateManager: StateManager) {
        this.orderBook = orderBook
        this.stateManager = stateManager
    }

    submitOrder(limitOrder: LimitOrder) {
        this.validateOrder(limitOrder)
        this.stateManager.incrementUserNonce(limitOrder.user)
        this.orderBook.add(limitOrder) 
        const matches = this.orderBook.match()
        if (matches.length) {
            this.settleTrades(matches)
        }
    }

    private validateOrder(limitOrder: LimitOrder) {
        const accountState = this.stateManager.getAccount(limitOrder.user)

        if(accountState.nonce != limitOrder.nonce) {
            throw new Error("INVALID TRANSACTION NONCE")
        }

        if (limitOrder.side === 0) { // SELL
            const state = accountState.balances.get(limitOrder.sToken)!
            if (state.available < limitOrder.amount) {
                throw new Error("INSUFFICIENT FUNDS")
            }
            state.available -= limitOrder.amount
            state.locked += limitOrder.amount
        }
        else {
            const value = limitOrder.amount * limitOrder.price
            const state = accountState.balances.get(limitOrder.bToken)!
            if (state.available < value) {
                throw new Error("INSUFFICIENT FUNDS")
            }
            state.available -= value
            state.locked += value
        }
    }

    private settleTrades(matches: [LimitOrder, LimitOrder, bigint][]) {
        const accountCache = new Map<`0x${string}`, AccountState>(); // exists in memory so that keyHash does not have to be recomputed at every query

        const getCachedAccount = (user: `0x${string}`): AccountState => { // memory mapping / function
            if(!accountCache.has(user)) { // this can cause our code to run out of sync if not all matches are executed. So instead ill creat a clone / snapshot of this.
                const state = this.stateManager.getAccount(user)
                if (!state) {throw new Error("STATE NOT FOUND")}
                const clone: AccountState = {
                    nonce: state.nonce,
                    balances: new Map(Array.from(state.balances.entries()).map(([token, balances]) => [
                        token,
                        {... balances}
                    ]))
                };
                accountCache.set(user, clone) // IMMUTABILITY IMPLEMENTATING TO AVOID DESYNCING STATE WITH SMT IF TS FAILS BEFORE BATCH IS COMPELTE
            }
            return accountCache.get(user)!
        }
        
        for (const [bids, asks, amount] of matches) {
            const tradeValue =  amount * asks.price

            let seller = accountCache.get(asks.user)// Instead of repeatedly recaluculating hashes for users that have large orders (multiple needs to be filled and updating balances each time), we can use a memory mapping that checks to see if their (user,token) has already been hashed.
            if(!seller) {seller = getCachedAccount(asks.user)}

            let buyer = accountCache.get(bids.user)
            if(!buyer) {buyer = getCachedAccount(bids.user)}

            if (seller.balances.get(asks.sToken)!.locked < amount) {throw new Error("INSUFFICIENT LOCKED")} // INVARIANTS 
            if (buyer.balances.get(bids.bToken)!.locked < tradeValue ) {throw new Error("INSUFFIIENT LOCKED")} // ^^

            seller.balances.get(asks.sToken)!.locked -= amount
            seller.balances.get(asks.bToken)!.available += tradeValue

            buyer.balances.get(bids.bToken)!.locked -= tradeValue
            buyer.balances.get(bids.sToken)!.available += amount
        }
        const updates: AccountUpdates[] = Array.from(accountCache.entries()).map(([user, account]) => ({
            user,
            account
        }));
        
        this.stateManager.executeBatchAccountUpdates(updates)
         // Nonce is incremented multiple times during trade settlement. Need to create a seperate SMT tree that tracks user nonce irrelevant of its asscociated token balances. --  done
    }
}

/** TO DO LIST
 * MY STATE MANAGER SHOULD EXPOSE 
 * Include buyer validation -- done 
 *  * Used locked balanced so that user cannot spend more than what they have which may result in trades that cannot be commited -- done
 * Compute only after the batch is finished -- done
 * Included 'locked' so users can't spend more than what they have in batch transactions -- already included 
 * Use temporary in batch state instead of rehashing at every update -- done
 * Process all trades in memory  -- done
 * Insted of computing multiple repeat hashes for every fill, calulcate it once and map/pull the values from our mapping. -- done
 * Change user and token to ID's so that the SMT's can be calculated faster  XXX -- REDUNDANT 
 * NEXT MAJOR ARCHITECHTURAL UPGRADE: 
 * Instead of having two seperate SMT's have one key that tracks nonce and balances[tokenID], halving the writes. DONE
 * Include deteministic batching and trade netting (overkill for a dex that trades only a few tokens)
 * Create snapshots of balances to maintain data integrity and avoid out state and SMT to go out of sync during settleTrades().
 */