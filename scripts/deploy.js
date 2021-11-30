const hre = require("hardhat");
require('dotenv').config()
const { SPY_TOKEN_BSC_MAIN_NET, SPY_TOKEN_BSC_TEST_NET } = process.env;

async function main() {

    const [deployer] = await ethers.getSigners();

    let spyTokenAddr = SPY_TOKEN_BSC_MAIN_NET;
    let spyToken = undefined;

    if (network.name == 'development') {
        const SpyToken = await hre.ethers.getContractFactory("SpyToken");
        spyToken = await SpyToken.deploy();
        await spyToken.deployed();
        spyTokenAddr = spyToken.address;
    } else if (network.name == 'bsctest') {
        spyTokenAddr = SPY_TOKEN_BSC_TEST_NET;
        const SpyToken = await hre.ethers.getContractFactory("SpyToken");
        spyToken = await SpyToken.attach(spyTokenAddr);
    } else {
        spyTokenAddr = SPY_TOKEN_BSC_MAIN_NET;
    }

    // deploy the referral

    const SpyReferral = await hre.ethers.getContractFactory("SpyReferral");
    const spyReferral = await SpyReferral.deploy();
    await spyReferral.deployed();

    // get current block number
    const block = await web3.eth.getBlock("latest");

    // deploy the MasterChef

    const MasterChef = await hre.ethers.getContractFactory("MasterChef");
    const masterChef = await MasterChef.deploy(spyTokenAddr, 1, block.number);
    await masterChef.deployed();
    await masterChef.setSpyReferral(spyReferral.address);

    await spyReferral.updateOperator(masterChef.address, true);

    const miningPoolAddr = await masterChef.miningPool();
    const marketingPoolAddr = await masterChef.marketingPool();

    if (network.name == 'development' || network.name == 'bsctest'){

        console.warn('Depositing to mining pool ' + miningPoolAddr);
        await spyToken.transfer(miningPoolAddr, 1000000e0);

        console.warn('Depositing to marketing pool ' + marketingPoolAddr);
        await spyToken.transfer(marketingPoolAddr, 1000000e0);

    } else {

        // console.warn('Do not forget to transfer ownership of the token');

        console.warn('Do not forget to deposit in the mining pool');

        console.warn('Do not forget to deposit in the marketing pool');
    }

    console.log('Token :' + spyTokenAddr);
    console.log('MasterChef :' + masterChef.address);
    console.log('Minging Pool :' + miningPoolAddr);
    console.log('MarketingPool Pool :' + marketingPoolAddr);
    console.log('Referral :' + spyReferral.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
