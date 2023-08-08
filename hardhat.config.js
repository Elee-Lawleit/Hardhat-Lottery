require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-deploy");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("dotenv").config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const ETHEREUM_ACCOUNT_PRIVATE_KEY = process.env.ETHEREUM_ACCOUNT_PRIVATE_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY;

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
      blockConfirmations: 1,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [  ETHEREUM_ACCOUNT_PRIVATE_KEY /* ACC_PR_Key_02,  ACC_PR_Key_03*/, ],
      chainId: 11155111,
      //to wait this many blocks
      blockConfirmations: 6
    },
    localhost: {
      url: "http://127.0.0.1:8545/",
      // accounts: [don't need to give any account here, hardhat automatically gets them]
      chainId: 31337,
    },
  },
  solidity: "0.8.19",
  namedAccounts: {
    deployer: {
      default: 0
    },
    player: {
      default: 1
    }
  }
};
