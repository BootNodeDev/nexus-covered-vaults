// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
  error EthNotExpected();

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

  // function buyCover(BuyCoverParams calldata params, PoolAllocationRequest[] calldata coverChunkRequests)
  //   external
  //   payable
  //   onlyAllowed
  //   returns (uint256 coverId)
  // {
  //   bool isETH = params.paymentAsset == 0;

  //   if (isETH) {
  //     uint256 initialBalance = address(this).balance - msg.value;

  //     coverId = ICover(coverContract).buyCover{ value: msg.value }(params, coverChunkRequests);

  //     uint256 finalBalance = address(this).balance;

  //     // solhint-disable-next-line avoid-low-level-calls
  //     (bool success, ) = address(msg.sender).call{ value: finalBalance - initialBalance }("");
  //     if (!success) {
  //       revert SendingEthFailed();
  //     }
  //   } else {
  //     (address asset, ) = IPool(pool).coverAssets(params.paymentAsset);
  //     uint256 initialBalance = IERC20(asset).balanceOf(address(this));

  //     IERC20(asset).transferFrom(msg.sender, address(this), params.maxPremiumInAsset);

  //     coverId = ICover(coverContract).buyCover{ value: msg.value }(params, coverChunkRequests);

  //     uint256 finalBalance = IERC20(asset).balanceOf(address(this));

  //     IERC20(asset).transferFrom(address(this), msg.sender, finalBalance - initialBalance);
  //   }

  //   return coverId;
  // }

  /**
   * @dev buyCover as CoverManager, member of Nexus
   * @param params parameters to call buyCover
   * @param coverChunkRequests Data for each poolId
   */
  function buyCover(BuyCoverParams calldata params, PoolAllocationRequest[] calldata coverChunkRequests)
    external
    payable
    onlyAllowed
    returns (uint256 coverId)
  {
    uint256 initialBalance;
    uint256 finalBalance;

    bool isETH = params.paymentAsset == 0;
    if (!isETH && msg.value != 0) {
      revert EthNotExpected();
    }

    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    initialBalance = isETH ? address(this).balance - msg.value : IERC20(asset).balanceOf(address(this));

    coverId = ICover(coverContract).buyCover{ value: msg.value }(params, coverChunkRequests);

    finalBalance = isETH ? address(this).balance : IERC20(asset).balanceOf(address(this));

    // Not spent ETH/Asset is returned to buyer
    if (isETH) {
      // solhint-disable-next-line avoid-low-level-calls
      (bool success, ) = address(msg.sender).call{ value: finalBalance - initialBalance }("");
      if (!success) {
        revert SendingEthFailed();
      }
    } else {
      SafeERC20.safeTransfer(IERC20(asset), msg.sender, finalBalance - initialBalance);
    }

    return coverId;
  }
}
