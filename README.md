# ZK DEX

A zero-knowledge proof based decentralized exchange implementation leveraging Sparse Merkle Trees for privacy-preserving balance verification. This project combines Solidity smart contracts with TypeScript utilities to enable confidential trading while maintaining transparency and verifiability through cryptographic proofs.

The system utilizes Poseidon hashing and ZK-Kit's Sparse Merkle Tree implementation to create a secure and efficient balance sheet management system that protects user privacy without sacrificing the integrity of the exchange operations.

**CONTEXT**
The whole point of this project is to create a MEV resistant protocol that executes trades in a dark room off chain. Front runners do not know who and what is being traded, explicitly and actively removing this risk entirely. A merkle tree that generates a single bytes32 object of a complex mapping of a user, token addresses and their corresponding balances is generated off chain. This will act as a database, storing crucial information off-chain. A trading engine that generates an order, created by user inputs (amount, addresses, signatures/nonces) will firstly be cross-referenced with the database (which stores user balances) will be matched with another order (orders can be pooled). Once matched, the merkle root will be updated. This will be routed through our blackbox, which generates a merkle proof that combines private inputs (the trade details) and the public input (the old and new merkel roots) that will be referenced by our smart contract which is a vault that holds tokens. By reading events (like when a user deposits eth), we update our database. This effectively mitigates MEV by bypassing the mempool (within this context) entirely.

