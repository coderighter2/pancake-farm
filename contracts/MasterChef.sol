pragma solidity 0.6.12;

import '@pancakeswap/pancake-swap-lib/contracts/math/SafeMath.sol';
import '@pancakeswap/pancake-swap-lib/contracts/token/BEP20/IBEP20.sol';
import '@pancakeswap/pancake-swap-lib/contracts/token/BEP20/SafeBEP20.sol';
import '@pancakeswap/pancake-swap-lib/contracts/access/Ownable.sol';

import "./SpyToken.sol";
import "./SpyPool.sol";
import "./libs/ISpyReferral.sol";

// import "@nomiclabs/buidler/console.sol";

interface IMigratorChef {
    // Perform LP token migration from legacy PancakeSwap to SpySwap.
    // Take the current LP token address and return the new LP token address.
    // Migrator should have full access to the caller's LP token.
    // Return the new LP token address.
    //
    // XXX Migrator must have allowance access to PancakeSwap LP tokens.
    // SpySwap must mint EXACTLY the same amount of SpySwap LP tokens or
    // else something bad will happen. Traditional PancakeSwap does not
    // do that so be careful!
    function migrate(IBEP20 token) external returns (IBEP20);
}

// MasterChef is the master of SPY. He can make SPY and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once SPY is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterChef is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 rewardLockedUp;  // Reward locked up.
        uint256 nextHarvestUntil; // When can the user harvest again.
        //
        // We do some fancy math here. Basically, any point in time, the amount of SPYs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accSpyPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accSpyPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IBEP20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. SPYs to distribute per block.
        uint256 lastRewardBlock;  // Last block number that SPYs distribution occurs.
        uint256 accSpyPerShare; // Accumulated SPYs per share, times 1e30. See below.
        uint256 harvestInterval;  // Harvest interval in seconds
    }

    // The SPY TOKEN!
    SpyToken public spy;

    // The mining pool
    SpyPool public miningPool;

    // The mining pool
    SpyPool public marketingPool;
    // SPY tokens created per block.
    uint256 public spyPerBlock;
    // Bonus muliplier for early spy makers.
    uint256 public BONUS_MULTIPLIER = 1;

    uint256 public harvestInterval = 12 hours;
    // Max harvest interval: 14 days.
    uint256 public constant MAXIMUM_HARVEST_INTERVAL = 14 days;
    // The migrator contract. It has a lot of power. Can only be set through governance (owner).
    IMigratorChef public migrator;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when SPY mining starts.
    uint256 public startBlock;
    // Total locked up rewards
    uint256 public totalLockedUpRewards;

    // SPY referral contract address.
    ISpyReferral public spyReferral;
    // Referral commission rate in basis points.
    uint16 public referralCommissionRate = 500;
    // Max referral commission rate: 10%.
    uint16 public constant MAXIMUM_REFERRAL_COMMISSION_RATE = 1000;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event ReferralCommissionPaid(address indexed user, address indexed referrer, uint256 commissionAmount);
    event RewardLockedUp(address indexed user, uint256 indexed pid, uint256 amountLockedUp);

    constructor(
        SpyToken _spy,
        uint256 _spyPerBlock,
        uint256 _startBlock
    ) public {

        miningPool = new SpyPool("SPY Mining Pool", _spy);
        marketingPool = new SpyPool("SPY Marketing Pool", _spy);
        spy = _spy;
        spyPerBlock = _spyPerBlock;
        startBlock = _startBlock;

        totalAllocPoint = 1000;

    }

    function updateMultiplier(uint256 multiplierNumber) public onlyOwner {
        BONUS_MULTIPLIER = multiplierNumber;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, IBEP20 _lpToken, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accSpyPerShare: 0,
            harvestInterval: harvestInterval
        }));
        updateStakingPool();
    }

    // Update the given pool's SPY allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        set2(_pid, _allocPoint, harvestInterval, _withUpdate);
    }

    // Update the give pool's SPY allocation point with harvest interval
    function set2(uint256 _pid, uint256 _allocPoint, uint256 _harvestInterval, bool _withUpdate) public onlyOwner {
        require(_harvestInterval <= MAXIMUM_HARVEST_INTERVAL, "set: invalid harvest interval");
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].harvestInterval = _harvestInterval;
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(_allocPoint);
            updateStakingPool();
        }
    }

    function updateStakingPool() internal {
        uint256 length = poolInfo.length;
        uint256 points = 0;
        for (uint256 pid = 1; pid < length; ++pid) {
            points = points.add(poolInfo[pid].allocPoint);
        }
        if (points != 0) {
            points = points.div(3);
            totalAllocPoint = totalAllocPoint.sub(poolInfo[0].allocPoint).add(points);
            poolInfo[0].allocPoint = points;
        }
    }

    // Set the migrator contract. Can only be called by the owner.
    function setMigrator(IMigratorChef _migrator) public onlyOwner {
        migrator = _migrator;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid) public {
        require(address(migrator) != address(0), "migrate: no migrator");
        PoolInfo storage pool = poolInfo[_pid];
        IBEP20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IBEP20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
        pool.lpToken = newLpToken;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from).mul(BONUS_MULTIPLIER);
    }

    // View function to see pending SPYs on frontend.
    function pendingSpy(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accSpyPerShare = pool.accSpyPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 spyReward = multiplier.mul(spyPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accSpyPerShare = accSpyPerShare.add(spyReward.mul(1e30).div(lpSupply));
        }
        return user.amount.mul(accSpyPerShare).div(1e30).sub(user.rewardDebt);
    }

    // View function to see if user can harvest SPYs.
    function canHarvest(uint256 _pid, address _user) public view returns (bool) {
        UserInfo storage user = userInfo[_pid][_user];
        return block.timestamp >= user.nextHarvestUntil;
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }


    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 spyReward = multiplier.mul(spyPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        pool.accSpyPerShare = pool.accSpyPerShare.add(spyReward.mul(1e30).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterChef for SPY allocation.
    function deposit(uint256 _pid, uint256 _amount, address _referrer) public {

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (_amount > 0 && address(spyReferral) != address(0) && _referrer != address(0) && _referrer != msg.sender) {
            spyReferral.recordReferral(msg.sender, _referrer);
        }
        payOrLockupPendingSpy(_pid);
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accSpyPerShare).div(1e30);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");

        updatePool(_pid);
        payOrLockupPendingSpy(_pid);
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accSpyPerShare).div(1e30);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
        user.rewardLockedUp = 0;
        user.nextHarvestUntil = 0;
    }

    // Pay or lockup pending SPYs.
    function payOrLockupPendingSpy(uint256 _pid) internal {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        if (user.nextHarvestUntil == 0) {
            user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);
        }

        uint256 pending = user.amount.mul(pool.accSpyPerShare).div(1e30).sub(user.rewardDebt);
        if (canHarvest(_pid, msg.sender)) {
            if (pending > 0 || user.rewardLockedUp > 0) {
                uint256 totalRewards = pending.add(user.rewardLockedUp);

                // reset lockup
                totalLockedUpRewards = totalLockedUpRewards.sub(user.rewardLockedUp);
                user.rewardLockedUp = 0;
                user.nextHarvestUntil = block.timestamp.add(pool.harvestInterval);

                uint256 totalRewardsToHarvest = totalRewards;

                // pay referral commision
                payReferralCommission(msg.sender, totalRewards);

                // take harvest fee
                totalRewardsToHarvest = takeHarvestFee(totalRewardsToHarvest);

                // send rewards
                miningPool.safeTransfer(msg.sender, totalRewardsToHarvest);
            }
        } else if (pending > 0) {
            user.rewardLockedUp = user.rewardLockedUp.add(pending);
            totalLockedUpRewards = totalLockedUpRewards.add(pending);
            emit RewardLockedUp(msg.sender, _pid, pending);
        }
    }

    // Withdraw spy tokens from SPY Pool.
    function withdrawMiningPool(address _to, uint256 _amount) public onlyOwner {
        miningPool.safeTransfer(_to, _amount);
    }

    // Withdraw spy tokens from SPY Pool.
    function withdrawMarketingPool(address _to, uint256 _amount) public onlyOwner {
        marketingPool.safeTransfer(_to, _amount);
    }

    // Set spyPerBlock for farming pools
    function setSpyPerBlock(uint256 _spyPerBlock) public onlyOwner {
        require(_spyPerBlock <= 1000, "set: invalid spyPerBlock");
        spyPerBlock = _spyPerBlock;
    }

    // Set default harvest interval for farming pools
    function setHarvestInterval(uint256 _harvestInterval) public onlyOwner {
        require(_harvestInterval <= MAXIMUM_HARVEST_INTERVAL, "set: invalid harvest interval");
        harvestInterval = _harvestInterval;
    }

    // Update the spy referral contract address by the owner
    function setSpyReferral(ISpyReferral _spyReferral) public onlyOwner {
        spyReferral = _spyReferral;
    }

    // Update referral commission rate by the owner
    function setReferralCommissionRate(uint16 _referralCommissionRate) public onlyOwner {
        require(_referralCommissionRate <= MAXIMUM_REFERRAL_COMMISSION_RATE, "setReferralCommissionRate: invalid referral commission rate basis points");
        referralCommissionRate = _referralCommissionRate;
    }

    // Pay referral commission to the referrer who referred this user.
    function payReferralCommission(address _user, uint256 _pending) internal {
        if (address(spyReferral) != address(0) && referralCommissionRate > 0) {
            address referrer = spyReferral.getReferrer(_user);
            uint256 commissionAmount = _pending.mul(referralCommissionRate).div(10000);

            if (referrer != address(0) && commissionAmount > 0) {
                marketingPool.safeTransfer(referrer, commissionAmount);
                spyReferral.recordReferralCommission(referrer, commissionAmount);
                emit ReferralCommissionPaid(_user, referrer, commissionAmount);
            }
        }
    }

    // Take harvest fee 2.5%. 1% LP, 1% farming pool, 0.05% marketing wallet
    function takeHarvestFee(uint256 _pending) internal returns (uint256) {

        // 0.05% for marketing wallet
        uint256 marketingAmount = _pending.mul(500).div(100000);

        // 1% for farming pool
        uint256 farmingAmount = _pending.mul(1000).div(100000);

        // 1% for LP pool
        uint256 lpAmount = _pending.mul(1000).div(100000);

        uint256 remaining = _pending.sub(lpAmount).sub(farmingAmount).sub(marketingAmount);

        require(remaining > 0, "Too small amount to harvest");

        // send 0.5% to marketing wallet
        miningPool.safeTransfer(address(marketingPool), marketingAmount);

        return remaining;
    }
}
