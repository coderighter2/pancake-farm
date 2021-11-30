const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const SpyToken = artifacts.require('SpyToken');
const MasterChef = artifacts.require('MasterChef');
const SpyReferral = artifacts.require('SpyReferral');
const MockBEP20 = artifacts.require('libs/MockBEP20');
const LotteryRewardPool = artifacts.require('LotteryRewardPool');

contract('LotteryPool', ([alice, bob, carol, referrer, dev, minter]) => {
  beforeEach(async () => {
    this.spy = await SpyToken.new({ from: minter });
    this.lp1 = await MockBEP20.new('LPToken', 'LP1', '1000000', {
      from: minter,
    });
    this.lp2 = await MockBEP20.new('LPToken', 'LP2', '1000000', {
      from: minter,
    });
    this.lp3 = await MockBEP20.new('LPToken', 'LP3', '1000000', {
      from: minter,
    });
    this.lp4 = await MockBEP20.new('LPToken', 'LP4', '1000000', {
      from: minter,
    });

    this.chef = await MasterChef.new(this.spy.address, '1000', '10', { from: minter });
    await this.chef.setHarvestInterval(0, { from: minter });
    await this.spy.transferOwnership(this.chef.address, { from: minter });
    this.referral = await SpyReferral.new({ from: minter });
    await this.referral.updateOperator(this.chef.address, true, { from: minter });
    await this.chef.setSpyReferral(this.referral.address, { from: minter });

    const miningPool = await this.chef.miningPool();
    const marketingPool = await this.chef.marketingPool();

    await this.spy.transfer(miningPool, '10000', {from: minter});
    await this.spy.transfer(marketingPool, '10000', {from: minter});

    await this.lp1.transfer(bob, '2000', { from: minter });
    await this.lp2.transfer(bob, '2000', { from: minter });
    await this.lp3.transfer(bob, '2000', { from: minter });

    await this.lp1.transfer(alice, '2000', { from: minter });
    await this.lp2.transfer(alice, '2000', { from: minter });
    await this.lp3.transfer(alice, '2000', { from: minter });
  });

  it('real case', async () => {
    await time.advanceBlockTo('70');
    this.lottery = await LotteryRewardPool.new(
      this.chef.address,
      this.spy.address,
      dev,
      carol,
      { from: minter }
    );
    await this.lp4.transfer(this.lottery.address, '10', { from: minter });

    await this.chef.add('1000', this.lp1.address, true, { from: minter });
    await this.chef.add('1000', this.lp2.address, true, { from: minter });
    await this.chef.add('500', this.lp3.address, true, { from: minter });
    await this.chef.add('500', this.lp4.address, true, { from: minter });

    assert.equal(
      (await this.lp4.balanceOf(this.lottery.address)).toString(),
      '10'
    );

    await time.advanceBlockTo('80');
    await this.lottery.startFarming(3, this.lp4.address, '1', referrer, { from: dev });
    await time.advanceBlockTo('84');

    assert.equal((await this.lottery.pendingReward('3')).toString(), '375');
    assert.equal(
      (await this.spy.balanceOf(this.lottery.address)).toString(),
      '0'
    );

    await this.lottery.harvest(3, { from: dev });

    assert.equal(
      (await this.spy.balanceOf(this.lottery.address)).toString(),
      '0'
    );
    assert.equal((await this.spy.balanceOf(carol)).toString(), '488');
  });

  it('setReceiver', async () => {
    this.lottery = await LotteryRewardPool.new(
      this.chef.address,
      this.spy.address,
      dev,
      carol,
      { from: minter }
    );
    await this.lp1.transfer(this.lottery.address, '100', { from: minter });
    await this.chef.add('1000', this.lp1.address, true, { from: minter });

    assert.equal((await this.lp1.balanceOf(this.lottery.address)).toString(), "100");


    await time.advanceBlockTo('110');
    await this.lottery.startFarming(0, this.lp1.address, '100', referrer, {
      from: dev,
    });
    assert.equal((await this.lp1.balanceOf(this.lottery.address)).toString(), "0");
    assert.equal((await this.spy.balanceOf(this.lottery.address)).toString(), "0");
    assert.equal((await this.spy.balanceOf(referrer)).toString(), '0');
    assert.equal((await time.latestBlock()).toString(), "111");
    await this.lottery.harvest(0, { from: dev });
    assert.equal((await time.latestBlock()).toString(), "112");
    assert.equal((await this.spy.balanceOf(this.lottery.address)).toString(), "0");
    assert.equal((await this.spy.balanceOf(referrer)).toString(), '25');
    assert.equal((await this.spy.balanceOf(carol)).toString(), '488');
    
    await this.lottery.setReceiver(alice, { from: dev });
    assert.equal((await this.lottery.pendingReward('0')).toString(), '500');
    await this.lottery.harvest(0, { from: dev });
    assert.equal((await this.spy.balanceOf(alice)).toString(), '975');
  });

  it('emergencyWithdraw', async () => {});

  it('update admin', async () => {
    this.lottery = await LotteryRewardPool.new(
      this.chef.address,
      this.spy.address,
      dev,
      carol,
      { from: minter }
    );
    assert.equal(await this.lottery.adminAddress(), dev);
    await this.lottery.setAdmin(alice, { from: minter });
    assert.equal(await this.lottery.adminAddress(), alice);
    await this.chef.add('1000', this.lp1.address, true, { from: minter });
    await expectRevert(
      this.lottery.startFarming(0, this.lp1.address, '1', referrer, { from: dev }),
      'admin: wut?'
    );
  });
});
