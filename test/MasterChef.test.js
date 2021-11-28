const { expectRevert, time, constants } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const SpyToken = artifacts.require('SpyToken');
const MasterChef = artifacts.require('MasterChef');
const MockBEP20 = artifacts.require('libs/MockBEP20');
const SpyReferral = artifacts.require('SpyReferral');

contract('MasterChef', ([alice, bob, carol, referrer, dev, minter]) => {
    beforeEach(async () => {
        this.spy = await SpyToken.new({ from: minter });
        this.lp1 = await MockBEP20.new('LPToken', 'LP1', '1000000', { from: minter });
        this.lp2 = await MockBEP20.new('LPToken', 'LP2', '1000000', { from: minter });
        this.lp3 = await MockBEP20.new('LPToken', 'LP3', '1000000', { from: minter });
        this.chef = await MasterChef.new(this.spy.address, '1000', '10', { from: minter });
        await this.chef.setHarvestInterval(0, { from: minter });
        await this.spy.transferOwnership(this.chef.address, { from: minter });
        this.referral = await SpyReferral.new({ from: minter });
        await this.referral.updateOperator(this.chef.address, true, { from: minter });
        await this.chef.setSpyReferral(this.referral.address, { from: minter });

        await this.lp1.transfer(bob, '2000', { from: minter });
        await this.lp2.transfer(bob, '2000', { from: minter });
        await this.lp3.transfer(bob, '2000', { from: minter });

        await this.lp1.transfer(alice, '2000', { from: minter });
        await this.lp2.transfer(alice, '2000', { from: minter });
        await this.lp3.transfer(alice, '2000', { from: minter });

        const miningPool = await this.chef.miningPool();
        const marketingPool = await this.chef.marketingPool();

        await this.spy.transfer(miningPool, '10000', {from: minter});
        await this.spy.transfer(marketingPool, '10000', {from: minter});
    });
    it('real case', async () => {
      this.lp4 = await MockBEP20.new('LPToken', 'LP1', '1000000', { from: minter });
      this.lp5 = await MockBEP20.new('LPToken', 'LP2', '1000000', { from: minter });
      this.lp6 = await MockBEP20.new('LPToken', 'LP3', '1000000', { from: minter });
      this.lp7 = await MockBEP20.new('LPToken', 'LP1', '1000000', { from: minter });
      this.lp8 = await MockBEP20.new('LPToken', 'LP2', '1000000', { from: minter });
      this.lp9 = await MockBEP20.new('LPToken', 'LP3', '1000000', { from: minter });
      await this.chef.add('2000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });
      await this.chef.add('500', this.lp3.address, true, { from: minter });
      await this.chef.add('500', this.lp3.address, true, { from: minter });
      await this.chef.add('500', this.lp3.address, true, { from: minter });
      await this.chef.add('500', this.lp3.address, true, { from: minter });
      await this.chef.add('500', this.lp3.address, true, { from: minter });
      await this.chef.add('100', this.lp3.address, true, { from: minter });
      await this.chef.add('100', this.lp3.address, true, { from: minter });
      assert.equal((await this.chef.poolLength()).toString(), "9");

      await time.advanceBlockTo('190');
      await this.lp1.approve(this.chef.address, '1000', { from: alice });
      assert.equal((await this.spy.balanceOf(alice)).toString(), '0');
      await this.chef.deposit(0, '20', referrer, { from: alice });
      await this.chef.withdraw(0, '20', { from: alice });
      assert.equal((await this.spy.balanceOf(alice)).toString(), '202');
      assert.equal((await this.spy.balanceOf(referrer)).toString(), '10');
    })


    it('deposit/withdraw', async () => {
      await this.chef.add('1000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });
      await this.chef.add('1000', this.lp3.address, true, { from: minter });

      await this.lp1.approve(this.chef.address, '100', { from: alice });
      await time.advanceBlockTo('300');
      await this.chef.deposit(0, '20', referrer, { from: alice });
      await this.chef.deposit(0, '0', constants.ZERO_ADDRESS, { from: alice });
      await this.chef.deposit(0, '40', constants.ZERO_ADDRESS, { from: alice });
      await this.chef.deposit(0, '0', constants.ZERO_ADDRESS, { from: alice });
      assert.equal((await this.lp1.balanceOf(alice)).toString(), '1940');
      await this.chef.withdraw(0, '10', { from: alice });
      assert.equal((await this.lp1.balanceOf(alice)).toString(), '1950');
      assert.equal((await this.spy.balanceOf(alice)).toString(), '715');
      assert.equal((await this.spy.balanceOf(referrer)).toString(), '36');

      await this.lp1.approve(this.chef.address, '100', { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '2000');
      await this.chef.deposit(0, '50', referrer, { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '1950');
      await this.chef.deposit(0, '0', constants.ZERO_ADDRESS, { from: bob });
      assert.equal((await this.spy.balanceOf(bob)).toString(), '91');
      assert.equal((await this.spy.balanceOf(referrer)).toString(), '40');
      await this.chef.emergencyWithdraw(0, { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '2000');
    })


    it('spyPerBlock', async () => {
      await this.chef.setSpyPerBlock('100', { from: minter });
      assert.equal((await this.chef.spyPerBlock()).toString(), '100');
    });
    // it('staking/unstaking', async () => {
    //   await this.chef.add('1000', this.lp1.address, true, { from: minter });
    //   await this.chef.add('1000', this.lp2.address, true, { from: minter });
    //   await this.chef.add('1000', this.lp3.address, true, { from: minter });

    //   await this.lp1.approve(this.chef.address, '10', { from: alice });
    //   await this.chef.deposit(0, '2', referrer, { from: alice }); //0
    //   await this.chef.withdraw(0, '2', referrer, { from: alice }); //1

    //   await this.spy.approve(this.chef.address, '250', { from: alice });
    //   await this.chef.enterStaking('240', { from: alice }); //3
    //   assert.equal((await this.syrup.balanceOf(alice)).toString(), '240');
    //   assert.equal((await this.spy.balanceOf(alice)).toString(), '10');
    //   await this.chef.enterStaking('10', { from: alice }); //4
    //   assert.equal((await this.syrup.balanceOf(alice)).toString(), '250');
    //   assert.equal((await this.spy.balanceOf(alice)).toString(), '249');
    //   await this.chef.leaveStaking(250);
    //   assert.equal((await this.syrup.balanceOf(alice)).toString(), '0');
    //   assert.equal((await this.spy.balanceOf(alice)).toString(), '749');

    // });


    // it('updaate multiplier', async () => {
    //   await this.chef.add('1000', this.lp1.address, true, { from: minter });
    //   await this.chef.add('1000', this.lp2.address, true, { from: minter });
    //   await this.chef.add('1000', this.lp3.address, true, { from: minter });

    //   await this.lp1.approve(this.chef.address, '100', { from: alice });
    //   await this.lp1.approve(this.chef.address, '100', { from: bob });
    //   await this.chef.deposit(0, '100', { from: alice });
    //   await this.chef.deposit(0, '100', { from: bob });
    //   await this.chef.deposit(0, '0', { from: alice });
    //   await this.chef.deposit(0, '0', { from: bob });

    //   await this.spy.approve(this.chef.address, '100', { from: alice });
    //   await this.spy.approve(this.chef.address, '100', { from: bob });
    //   await this.chef.enterStaking('50', { from: alice });
    //   await this.chef.enterStaking('100', { from: bob });

    //   await this.chef.updateMultiplier('0', { from: minter });

    //   await this.chef.enterStaking('0', { from: alice });
    //   await this.chef.enterStaking('0', { from: bob });
    //   await this.chef.deposit(1, '0', { from: alice });
    //   await this.chef.deposit(1, '0', { from: bob });

    //   assert.equal((await this.spy.balanceOf(alice)).toString(), '700');
    //   assert.equal((await this.spy.balanceOf(bob)).toString(), '150');

    //   await time.advanceBlockTo('265');

    //   await this.chef.enterStaking('0', { from: alice });
    //   await this.chef.enterStaking('0', { from: bob });
    //   await this.chef.deposit(1, '0', { from: alice });
    //   await this.chef.deposit(1, '0', { from: bob });

    //   assert.equal((await this.spy.balanceOf(alice)).toString(), '700');
    //   assert.equal((await this.spy.balanceOf(bob)).toString(), '150');

    //   await this.chef.leaveStaking('50', { from: alice });
    //   await this.chef.leaveStaking('100', { from: bob });
    //   await this.chef.withdraw(1, '100', { from: alice });
    //   await this.chef.withdraw(1, '100', { from: bob });

    // });
});
