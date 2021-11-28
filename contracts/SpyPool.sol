pragma solidity 0.6.12;

import '@pancakeswap/pancake-swap-lib/contracts/math/SafeMath.sol';
import '@pancakeswap/pancake-swap-lib/contracts/token/BEP20/IBEP20.sol';
import '@pancakeswap/pancake-swap-lib/contracts/access/Ownable.sol';


contract SpyPool is Ownable {

    // The MAIN TOKEN
    IBEP20 public token;

    string public name;

    constructor(
        string memory _name,
        IBEP20 _token
    ) public {
        token = _token;
        name = _name;
    }

    // Safe transfer <amount> of token to <to>
    function safeTransfer(address _to, uint256 _amount) public onlyOwner {
        uint256 bal = token.balanceOf(address(this));
        if (_amount > bal) {
            token.transfer(_to, bal);
        } else {
            token.transfer(_to, _amount);
        }
    }

}
