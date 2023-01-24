// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ICover, BuyCoverParams, PoolAllocationRequest } from "./interfaces/ICover.sol";
import { IPool } from "./interfaces/IPool.sol";

/**
 * @title CoverManager
 * @dev Contract allowed to interact with Nexus Mutual on behalf of allowed CoveredVaults
 */
contract CoverManager is Ownable {
  address public coverContract;
  address public yieldTokenIncidentContract;
  address public pool;

  mapping(address => bool) public isAllowed;

  event Allowed(address indexed addressAllowed);
  event Disallowed(address indexed addressDisallowed);

  error AddressNotAllowed();
  error AlreadyAllowed();
  error AlreadyDisallowed();
  error SendingEthFailed();

  modifier onlyAllowed() {
    if (!isAllowed[msg.sender]) {
      revert AddressNotAllowed();
    }
    _;
  }

  /**
   * @dev Initializes the main admin role
   */
  constructor(
    address _coverAddress,
    address _yieldTokenIncidentAddress,
    address _pool
  ) {
    coverContract = _coverAddress;
    yieldTokenIncidentContract = _yieldTokenIncidentAddress;
    pool = _pool;
  }

  /**
   * @dev Allow a CoveredVault to call methods in this contract
   * @param _toAllow Address to allow calling methods
   */
  function allowCaller(address _toAllow) external onlyOwner {
    if (isAllowed[_toAllow]) {
      revert AlreadyAllowed();
    }
    isAllowed[_toAllow] = true;
    emit Allowed(_toAllow);
  }

  /**
   * @dev Remove permission of a CoveredVault to call methods in this contract
   * @param _toDisallow Address to reject calling methods
   */
  function disallowCaller(address _toDisallow) external onlyOwner {
    if (!isAllowed[_toDisallow]) {
      revert AlreadyDisallowed();
    }
    isAllowed[_toDisallow] = false;
    emit Disallowed(_toDisallow);
  }

  /**
   * @dev
   * @param
   */
  function buyCover(BuyCoverParams calldata params, PoolAllocationRequest[] calldata coverChunkRequests)
    external
    payable
    onlyAllowed
    returns (uint256 coverId)
  {
    bool isETH = params.paymentAsset == 0;

    if (isETH) {
      uint256 initialBalance = address(this).balance;

      // TODO Send ETH to this?
      // IERC20(asset).transferFrom(msg.sender, address(this), params.maxPremiumInAsset);

      coverId = ICover(coverContract).buyCover{ value: msg.value }(params, coverChunkRequests);

      uint256 finalBalance = address(this).balance;

      (bool success, ) = address(msg.sender).call{ value: finalBalance - initialBalance }("");
      if (!success) {
        revert SendingEthFailed();
      }
    } else {
      (address asset, ) = IPool(pool).coverAssets(params.paymentAsset);
      uint256 initialBalance = IERC20(asset).balanceOf(address(this));

      IERC20(asset).transferFrom(msg.sender, address(this), params.maxPremiumInAsset);

      coverId = ICover(coverContract).buyCover{ value: msg.value }(params, coverChunkRequests);

      uint256 finalBalance = IERC20(asset).balanceOf(address(this));

      IERC20(asset).transferFrom(address(this), msg.sender, finalBalance - initialBalance);
    }

    return coverId;
  }

  /**
   * @dev
   * @param
   */
  function buyCover2(BuyCoverParams calldata params, PoolAllocationRequest[] calldata coverChunkRequests)
    external
    payable
    onlyAllowed
    returns (uint256 coverId)
  {
    bool isETH = params.paymentAsset == 0;
    uint256 initialBalance;
    uint256 finalBalance;

    (address asset, ) = IPool(pool).coverAssets(params.paymentAsset);

    initialBalance = isETH ? address(this).balance : IERC20(asset).balanceOf(address(this));

    // TODO Check what to do in isETH case
    // IERC20(asset).transferFrom(msg.sender, address(this), params.maxPremiumInAsset);

    coverId = ICover(coverContract).buyCover{ value: msg.value }(params, coverChunkRequests);

    finalBalance = isETH ? address(this).balance : IERC20(asset).balanceOf(address(this));

    if (isETH) {
      (bool success, ) = address(msg.sender).call{ value: finalBalance - initialBalance }("");
      if (!success) {
        revert SendingEthFailed();
      }
    } else {
      IERC20(asset).transferFrom(address(this), msg.sender, finalBalance - initialBalance);
    }

    return coverId;
  }
}
