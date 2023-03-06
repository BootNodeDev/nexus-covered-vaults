// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import { BuyCoverParams, PoolAllocationRequest, Product, CoverData, ProductParam } from "./../interfaces/ICover.sol";
import { IPool } from "./../interfaces/IPool.sol";
import { ICoverNFT } from "./../interfaces/ICoverNFT.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract CoverMock {
  address public pool;
  ICoverNFT public coverNFT;

  uint256 public constant PREMIUM_DENOMINATOR = 1e4;
  uint256 public premium = 100; // 1%
  uint256 public coverId = 1;

  Product[] internal _products;
  mapping(uint => CoverData) private _coverData;

  error CoverMock_PremiumTooHigh();
  error CoverMock_PremiumAmountHigherThanMaxPremium();
  error CoverMock_InsufficientETHForPremium();
  error CoverMock_EthSendFailed();

  constructor(address _pool, address _coverNFT) {
    pool = _pool;
    coverNFT = ICoverNFT(_coverNFT);
  }

  function setPremium(uint256 _premium) public {
    if (_premium > PREMIUM_DENOMINATOR) revert CoverMock_PremiumTooHigh();
    premium = _premium;
  }

  function setProducts(ProductParam[] calldata productParams) external {
    for (uint i = 0; i < productParams.length; i++) {
      ProductParam calldata param = productParams[i];
      Product calldata product = param.product;

      // New product has id == uint256.max
      if (param.productId == type(uint256).max) {
        _products.push(product);
        continue;
      }
    }
  }

  function buyCover(
    BuyCoverParams calldata params,
    PoolAllocationRequest[] calldata /* coverChunkRequests */
  ) external payable returns (uint256) {
    uint256 amountToPay = ((params.amount * premium) / PREMIUM_DENOMINATOR);
    if (amountToPay > params.maxPremiumInAsset) {
      revert CoverMock_PremiumAmountHigherThanMaxPremium();
    }

    address asset = IPool(pool).getAsset(params.paymentAsset).assetAddress;

    if (params.coverId == 0) {
      // new cover
      uint256 newCoverId = coverId + 1;
      ICoverNFT(coverNFT).mint(params.owner, newCoverId);
      _coverData[newCoverId] = CoverData(params.productId, params.coverAsset, 0 /* amountPaidOut */);
    }

    bool isETH = params.paymentAsset == 0;

    if (isETH) {
      if (amountToPay > msg.value) {
        revert CoverMock_InsufficientETHForPremium();
      }
      uint256 remaining = msg.value - amountToPay;
      if (remaining > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(msg.sender).call{ value: remaining }("");
        if (!success) revert CoverMock_EthSendFailed();
      }
    } else {
      SafeERC20.safeTransferFrom(IERC20(asset), msg.sender, address(this), amountToPay);
    }

    return (params.coverId == 0) ? ++coverId : params.coverId;
  }
}
