export default {
  solidity: "0.8.34",
  networks: {
    fork: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
      forking: {
        url: process.env.MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com",
        blockNumber: 26120400
      }
    }
  }
};