// SPDX-License-Identifier: MIT

pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "../RelayerRegistry.sol";

contract RegistryCallForwarder {
  address public immutable governance;
  RelayerRegistry public immutable Registry;

  constructor(address governanceAddress, address registryAddress) public {
    governance = governanceAddress;
    Registry = RelayerRegistry(registryAddress);
  }

  modifier onlyGovernance() {
    require(governance == msg.sender, "only governance");
    _;
  }

  function forwardSetMinStakeAmount(uint256 minAmount) external onlyGovernance {
    Registry.setMinStakeAmount(minAmount);
  }

  function forwardRegisterProxy(address tornadoProxyAddress) external onlyGovernance {
    Registry.registerProxy(tornadoProxyAddress);
  }

  function forwardNullifyBalance(address relayer) external onlyGovernance {
    Registry.nullifyBalance(relayer);
  }

  function forwardIsRelayer(address account) external view onlyGovernance returns (bool) {
    Registry.isRelayer(account);
  }

  function getRegistryData() external returns (RelayerRegistryData) {
    return Registry.RegistryData();
  }
}
