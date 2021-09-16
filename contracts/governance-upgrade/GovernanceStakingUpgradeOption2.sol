// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import { GovernanceLotteryUpgrade } from "../../submodules/tornado-lottery-period/contracts/vault/GovernanceLotteryUpgrade.sol";

interface ITornadoStakingRewards {
  function governanceClaimFor(address recipient, address vault) external;

  function setStakePoints(address staker, uint256 amountLockedBeforehand) external;

  function setStakedAmountOnLock(uint256 amount) external;

  function setStakedAmountOnUnlock(uint256 amount) external;
}

contract GovernanceStakingUpgradeOption2 is GovernanceLotteryUpgrade {
  ITornadoStakingRewards public immutable staking;

  constructor(
    address stakingRewardsAddress,
    address gasCompLogic,
    address lotteryLogic,
    address userVaultAddress
  ) public GovernanceLotteryUpgrade(gasCompLogic, lotteryLogic, userVaultAddress) {
    staking = ITornadoStakingRewards(stakingRewardsAddress);
  }

  function lock(
    address owner,
    uint256 amount,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external virtual override {
    uint256 claimed = staking.governanceClaimFor(owner, address(userVault));
    staking.setStakePoints(owner, lockedBalance[owner]);
    super.lock(owner, amount, deadline, v, r, s);
    lockedBalance[owner] += claimed;
    staking.setStakedAmountOnLock(amount.add(claimed));
  }

  function lockWithApproval(uint256 amount) external virtual override {
    uint256 claimed = staking.governanceClaimFor(msg.sender, address(userVault));
    staking.setStakePoints(msg.sender, lockedBalance[msg.sender]);
    super.lockWithApproval(amount);
    lockedBalance[owner] += claimed;
    staking.setStakedAmountOnLock(amount.add(claimed));
  }

  function unlock(uint256 amount) external virtual override {
    staking.governanceClaimFor(msg.sender, msg.sender);
    staking.setStakePoints(msg.sender, lockedBalance[msg.sender]);
    super.unlock(amount);
    staking.setStakedAmountOnUnlock(amount);
  }
}
