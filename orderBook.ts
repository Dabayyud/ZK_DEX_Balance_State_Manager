import { LimitOrder } from "./orderInterface";

export class OrderBook {
    buyOrder: LimitOrder[] = []
    sellOrder: LimitOrder[] = []

    add(limitOrder: LimitOrder) {
        // 100, 90 , 80 (insert 95 buy side) pass, fail 
        // 20, 25, 40, 60 (insert 23 sell side) pass, pass, fail
        const orders = limitOrder.side === 1 ? this.buyOrder : this.sellOrder  
        let low = 0
        let high = orders.length

        while (low < high) {
            let mid = (low + high) >>> 1;
             
            let isBetterPrice = limitOrder.side === 1
            ? limitOrder.price > orders[mid].price 
            : limitOrder.price < orders[mid].price

            if (isBetterPrice) {
                high = mid
            }
            else {low = mid + 1}
        }
        orders.splice(low, 0, limitOrder)
    }

    add2(limitOrder: LimitOrder) {
        const orders = limitOrder.side === 1 ? this.buyOrder : this.sellOrder
        let low = 0
        let high = orders.length

        while (low < high) {
            let mid = (low + high) >>> 1
            let isBetterPrice = limitOrder.side === 1
            ? limitOrder.price > orders[mid].price :
            limitOrder.price < orders[mid].price 

            if (isBetterPrice) {high = mid}
            else {low = mid + 1}
        } 
        orders.splice(low, 0, limitOrder)
    }
    match(): [LimitOrder, LimitOrder, bigint][] {
        const trades: [LimitOrder, LimitOrder, bigint][] = [] // create an array of the input parameters  

        while (this.buyOrder.length && this.sellOrder.length) { // In the scenario where there is 0 buy and x sell or vice versa
            const highestBid = this.buyOrder[0]
            const lowestAsk = this.sellOrder[0]

            if(highestBid.price < lowestAsk.price) {break} // There will be no fill 

            const fillAmount = highestBid.amount - highestBid.filled < lowestAsk.amount - lowestAsk.filled ?
            highestBid.amount - highestBid.filled: lowestAsk.amount - lowestAsk.filled // determines the fill amount buy comparing order size or buys and asks

            highestBid.filled += fillAmount
            lowestAsk.filled += fillAmount 

            trades.push([highestBid, lowestAsk, fillAmount])

            if(highestBid.filled == highestBid.amount) {this.buyOrder.shift()} // When order is fully completed it is removed from list
            if(lowestAsk.filled == lowestAsk.amount) {this.sellOrder.shift()} // O(n) bottleneck 
        }
        return trades
    }
}

// lets challenge ourselves and create a heap structure so that we can proccess (match/add) trades alot faster.
// we were using 0(nlogn) now we are using a hybrid of 0(log(n)) and O(n) 