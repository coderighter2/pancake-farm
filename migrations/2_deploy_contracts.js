const SpyToken = artifacts.require("SpyToken");
const SpyReferral = artifacts.require("SpyReferral");
const MasterChef = artifacts.require("MasterChef");

module.exports = async function(deployer, network, accounts) {

    // deploy the token

    let spyTokenAddr = '';
    let spyToken = undefined;

    if (network == 'development' || network == 'testnet') {
        await deployer.deploy(SpyToken);
        spyToken = await SpyToken.deployed();
        spyTokenAddr = spyToken.address;
    } else {
        spyTokenAddr = '';
    }

    // deploy the referral

    await deployer.deploy(SpyReferral);
    const spyReferral = await SpyReferral.deployed();

    // get current block number
    const block = await web3.eth.getBlock("latest");

    // deploy the MasterChef

    await deployer.deploy(MasterChef, spyTokenAddr, 1000, block.number);
    const masterChef = await MasterChef.deployed();
    await masterChef.setSpyReferral(spyReferral.address);

    const miningPoolAddr = await masterChef.miningPool();
    const marketingPoolAddr = await masterChef.marketingPool();

    if (network == 'development' || network == 'testnet') {

        await spyToken.transferOwnership(masterChef.address);

        console.warn('Depositing to mining pool ' + miningPoolAddr);
        await spyToken.transfer(miningPoolAddr, 1000000e0);

        console.warn('Depositing to marketing pool ' + marketingPoolAddr);
        await spyToken.transfer(marketingPoolAddr, 1000000e0);

    } else {

        console.warn('Do not forget to transfer ownership of the token');

        console.warn('Do not forget to deposit in the mining pool');

        console.warn('Do not forget to deposit in the marketing pool');
    }

    console.log('Token :' + spyToken.address);
    console.log('MasterChef :' + masterChef.address);
    console.log('Minging Pool :' + miningPoolAddr);
    console.log('MarketingPool Pool :' + marketingPoolAddr);
    console.log('Referral :' + spyReferral.address);
};
