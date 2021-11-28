const { assert } = require("chai");

const SpyToken = artifacts.require('SpyToken');

contract('SpyToken', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.spy = await SpyToken.new({ from: minter });
    });
});
