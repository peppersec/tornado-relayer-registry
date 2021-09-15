const { ethers, upgrades } = require('hardhat')
const { expect } = require('chai')
const { mainnet } = require("./tests.data.json");
const { token_addresses } = mainnet;
const { torn } = token_addresses;
const { namehash } = require('@ethersproject/hash');

describe('Data and Manager tests', () => {
  /// NAME HARDCODED
  let governance = mainnet.tornado_cash_addresses.governance
  let tornadoPools = mainnet.project_specific.contract_construction.RelayerRegistryData.tornado_pools
  let uniswapPoolFees = mainnet.project_specific.contract_construction.RelayerRegistryData.uniswap_pool_fees

  //// LIBRARIES
  let OracleHelperLibrary
  let OracleHelperFactory

  //// CONTRACTS / FACTORIES
  let DataManagerFactory
  let DataManagerProxy

  let RegistryDataFactory
  let RegistryData

  let RelayerRegistry
  let RegistryFactory

  let ControllerContract;

  //// IMPERSONATED ACCOUNTS
  let impGov
  let tornWhale

  //// NORMAL ACCOUNTS
  let signerArray

  //// HELPER FN
  let sendr = async (method, params) => {
    return await ethers.provider.send(method, params)
  }

  let getToken = async (tokenAddress) => {
    return await ethers.getContractAt('@openzeppelin/0.6.x/token/ERC20/IERC20.sol:IERC20', tokenAddress)
  }

  let erc20Transfer = async (tokenAddress, senderWallet, recipientAddress, amount) => {
    const token = (await getToken(tokenAddress)).connect(senderWallet)
    return await token.transfer(recipientAddress,amount)
  }

  let register = async (Name, Owner, Duration, Controller) => {
    const random = new Uint8Array(32);
    for(i = 0; i < 32; i++) { random[i] = Math.floor(Math.random() * 200) }
    const salt = "0x" + Array.from(random).map(b => b.toString(16).padStart(2, "0")).join("");
    const commitment = await Controller.makeCommitment(Name, Owner, salt);
    const tx = await Controller.commit(commitment);
    const price = (await Controller.rentPrice(Name, Duration)) * 1.1;

    setTimeout(async () => {
      // Submit our registration request
      await controller.register(name, owner, duration, salt, {value: price});
    }, 60000);
  }

  before(async () => {
    signerArray = await ethers.getSigners()

    OracleHelperFactory = await ethers.getContractFactory('UniswapV3OracleHelper')
    OracleHelperLibrary = await OracleHelperFactory.deploy()

    DataManagerFactory = await ethers.getContractFactory('RegistryDataManager', {
      libraries: {
        UniswapV3OracleHelper: OracleHelperLibrary.address,
      },
    })
    DataManagerProxy = await upgrades.deployProxy(DataManagerFactory, {
      unsafeAllow: ['external-library-linking'],
    })

    await upgrades.admin.changeProxyAdmin(DataManagerProxy.address, governance)

    RegistryDataFactory = await ethers.getContractFactory('RelayerRegistryData')

    RegistryData = await RegistryDataFactory.deploy(
      DataManagerProxy.address,
      governance,
      uniswapPoolFees,
      tornadoPools,
    )

    RegistryFactory = await ethers.getContractFactory('RelayerRegistry')

    RelayerRegistry = await RegistryFactory.deploy(RegistryData.address, governance, torn, DataManagerProxy.address)

    ControllerContract = await ethers.getContractAt('@ensdomains/ens-contracts/contracts/ethregistrar/ETHRegistrarController.sol:ETHRegistrarController', mainnet.project_specific.mocking['.eth_registrar_controller'])
  })

  describe('Start of tests', () => {
    describe('Setup procedure Manager and RegistryData', () => {
      it('Should impersonate governance properly', async () => {
        await sendr('hardhat_impersonateAccount', [governance])
        impGov = await ethers.getSigner(governance)
        await sendr('hardhat_setBalance', [governance, '0xDE0B6B3A7640000'])
      })

      it('Should set RegistryData global params', async () => {
        regData = await RegistryData.connect(impGov)
        await regData.setProtocolPeriod(ethers.utils.parseUnits('1000', 'wei'))
        await regData.setProtocolFee(ethers.utils.parseUnits('1000', 'szabo'))
      })

      it('Should pass initial fee update', async () => {
        await RegistryData.updateFees()
        for (i = 0; i < 8; i++) {
          const poolName = i <= 3 ? 'eth' : 'dai'
          const constant = i <= 3 ? 0.1 : 100
          console.log(
            `${poolName}-${constant * 10 ** (i % 4)}-pool fee: `,
            (await RegistryData.getFeeForPoolId(i)).div(ethers.utils.parseUnits('1', 'szabo')).toNumber() /
              1000000,
            `torn`,
          )
        }
      })
    })

    describe('Setup procedure RelayerRegistry', () => {
      it('Should have deployed Registry with proper data', async () => {
        expect(await RelayerRegistry.Governance()).to.equal(governance);
        expect(await RelayerRegistry.tornadoProxy()).to.equal(DataManagerProxy.address);
        expect(await RelayerRegistry.torn()).to.equal(torn);
      })

      it('Should set min stake amount to 100 TORN', async () => {
	const relReg = await RelayerRegistry.connect(impGov)
	await relReg.setMinStakeAmount(ethers.utils.parseEther("100"))
	expect(await relReg.minStakeAmount()).to.equal(ethers.utils.parseEther("100"))
      })

      it('Should successfully imitate a torn whale', async () => {
        await sendr('hardhat_impersonateAccount', ['0xA2b2fBCaC668d86265C45f62dA80aAf3Fd1dEde3'])
        tornWhale = await ethers.getSigner('0xA2b2fBCaC668d86265C45f62dA80aAf3Fd1dEde3')
      })
    })

    describe('Test registry registration', () => {
      let relayers = [];
      let offset = 3;

      it('Should successfully prepare a couple of relayer wallets', async () => {
	for(i = 0; i < 4; i++) {
	  const name = `relayer-${i}.eth`
	  relayers[i] = {
	    bytes32Name: namehash(name),
	    ensName: name,
	    address: signerArray[i+offset].address,
	    wallet: signerArray[i+offset]
	  }
	  await expect(() => erc20Transfer(torn, tornWhale, relayers[i].address, ethers.utils.parseEther("101"))).to.changeTokenBalance(await getToken(torn), relayers[i].wallet, ethers.utils.parseEther("101"))

	  const controller = await ControllerContract.connect(relayers[i].wallet);

	  await register(relayers[i].ensName, relayers[i].address, 24*60*60*365, controller)
	}
      })

      it('Should succesfully register all relayers', async () => {
	const metadata = {isRegistered: true, fee: ethers.utils.parseEther("0.1")}

	for(i = 0; i < 4; i++) {
	  ((await getToken(torn)).connect(relayers[i].wallet)).approve(RelayerRegistry.address, ethers.utils.parseEther("300"))

	  await RelayerRegistry.register(relayers[i].bytes32Name, ethers.utils.parseEther("101"), metadata)

	  expect(await RelayerRegistry.isRelayerRegistered(relayers[i].ensName)).to.be.true;
	  expect(await RelayerRegistry.getRelayerFee(relayers[i].ensName)).to.equal(metadata.fee);
	}
      })
    })
  })
})