// Contract ABIs for Counterstake Bridge

export const EXPORT_ABI = [
  // Events
  "event NewExpatriation(address indexed sender_address, uint amount, int reward, string foreign_address, string data)",
  
  // View functions
  "function foreign_network() view returns (string)",
  "function foreign_asset() view returns (string)",
  "function settings() view returns (tuple(uint16 counterstake_coef100, uint16 ratio100, uint min_stake, uint large_threshold, address tokenAddress, uint[] challenging_periods, uint[] large_challenging_periods))",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  
  // State changing functions
  "function transferToForeignChain(string foreign_address, string data, uint amount, int reward) payable",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
];

// 3DPass specific Export ABI (inherits from Counterstake3DPass)
export const EXPORT_3DPASS_ABI = [
  // Events
  "event NewExpatriation(address indexed sender_address, uint amount, int reward, string foreign_address, string data)",
  
  // View functions
  "function foreign_network() view returns (string)",
  "function foreign_asset() view returns (string)",
  "function settings() view returns (tuple(uint16 counterstake_coef100, uint16 ratio100, uint min_stake, uint large_threshold, address tokenAddress, uint[] challenging_periods, uint[] large_challenging_periods))",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
  
  // State changing functions
  "function transferToForeignChain(string foreign_address, string data, uint amount, int reward) payable",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
];

export const IMPORT_ABI = [
  // Events
  "event NewRepatriation(address indexed sender_address, uint amount, uint reward, string home_address, string data)",
  
  // View functions
  "function home_network() view returns (string)",
  "function home_asset() view returns (string)",
  "function oracleAddress() view returns (address)",
  "function min_price20() view returns (uint)",
  "function settings() view returns (tuple(uint16 counterstake_coef100, uint16 ratio100, uint min_stake, uint large_threshold, address tokenAddress, uint[] challenging_periods, uint[] large_challenging_periods))",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function transferToHomeChain(string home_address, string data, uint amount, uint reward)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
];

// 3DPass specific Import ABI (inherits from Counterstake3DPass)
export const IMPORT_3DPASS_ABI = [
  // Events
  "event NewRepatriation(address indexed sender_address, uint amount, uint reward, string home_address, string data)",
  
  // View functions
  "function home_network() view returns (string)",
  "function home_asset() view returns (string)",
  "function oracleAddress() view returns (address)",
  "function min_price20() view returns (uint)",
  "function settings() view returns (tuple(uint16 counterstake_coef100, uint16 ratio100, uint min_stake, uint large_threshold, address tokenAddress, uint[] challenging_periods, uint[] large_challenging_periods))",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function P3D_PRECOMPILE() view returns (address)",
  
  // State changing functions
  "function transferToHomeChain(string home_address, string data, uint amount, uint reward)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
];

export const FACTORY_ABI = [
  // Events
  "event ExportCreated(address indexed exportAddress, string foreign_network, string foreign_asset, address tokenAddress)",
  "event ImportCreated(address indexed importAddress, string home_network, string home_asset, address stakeTokenAddress)",
  
  // View functions
  "function getExports() view returns (address[])",
  "function getImports() view returns (address[])",
  "function getExport(string foreign_network, string foreign_asset, address tokenAddress) view returns (address)",
  "function getImport(string home_network, string home_asset, address stakeTokenAddress) view returns (address)",
  
  // State changing functions
  "function createExport(string foreign_network, string foreign_asset, address tokenAddress, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
  "function createImport(string home_network, string home_asset, string name, string symbol, address stakeTokenAddress, address oracleAddress, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
];

export const ASSISTANT_FACTORY_ABI = [
  // Events
  "event ExportAssistantCreated(address indexed assistantAddress, address exportAddress)",
  "event ImportAssistantCreated(address indexed assistantAddress, address importAddress)",
  
  // View functions
  "function getExportAssistants() view returns (address[])",
  "function getImportAssistants() view returns (address[])",
  "function getExportAssistant(address exportAddress) view returns (address)",
  "function getImportAssistant(address importAddress) view returns (address)",
  
  // State changing functions
  "function createExportAssistant(address exportAddress) returns (address)",
  "function createImportAssistant(address importAddress) returns (address)",
];

export const EXPORT_ASSISTANT_ABI = [
  // Events
  "event Claimed(address indexed claimer, uint amount, uint reward)",
  
  // View functions
  "function exportAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function balance() view returns (uint)",
  "function fee() view returns (uint)",
  
  // State changing functions
  "function claim(string foreign_address, string data, uint amount, int reward)",
  "function withdraw(uint amount)",
  "function setFee(uint newFee)",
];

export const IMPORT_ASSISTANT_ABI = [
  // Events
  "event Claimed(address indexed claimer, uint amount, uint reward)",
  
  // View functions
  "function importAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function balance() view returns (uint)",
  "function fee() view returns (uint)",
  
  // State changing functions
  "function claim(string home_address, string data, uint amount, uint reward)",
  "function withdraw(uint amount)",
  "function setFee(uint newFee)",
];

export const GOVERNANCE_ABI = [
  // Events
  "event VotedValueAdded(string name, address votedValueAddress)",
  "event VotedValueRemoved(string name, address votedValueAddress)",
  
  // View functions
  "function votedValues(string name) view returns (address)",
  "function getVotedValues() view returns (string[] names, address[] addresses)",
  "function balanceOf(address account) view returns (uint)",
  "function totalSupply() view returns (uint)",
  
  // State changing functions
  "function addVotedValue(string name, address votedValueAddress)",
  "function removeVotedValue(string name)",
  "function deposit() payable",
  "function withdraw(uint amount)",
];

export const VOTED_VALUE_UINT_ABI = [
  // Events
  "event ValueChanged(uint oldValue, uint newValue)",
  "event VoteSubmitted(address indexed voter, uint value, uint weight)",
  
  // View functions
  "function currentValue() view returns (uint)",
  "function governance() view returns (address)",
  "function getVotes() view returns (uint[] values, uint[] weights)",
  
  // State changing functions
  "function vote(uint value)",
  "function commit()",
];

export const VOTED_VALUE_ADDRESS_ABI = [
  // Events
  "event ValueChanged(address oldValue, address newValue)",
  "event VoteSubmitted(address indexed voter, address value, uint weight)",
  
  // View functions
  "function currentValue() view returns (address)",
  "function governance() view returns (address)",
  "function getVotes() view returns (address[] values, uint[] weights)",
  
  // State changing functions
  "function vote(address value)",
  "function commit()",
];

export const ORACLE_ABI = [
  // View functions
  "function getPrice(string asset1, string asset2) view returns (uint num, uint den)",
  
  // State changing functions
  "function setPrice(string asset1, string asset2, uint num, uint den)",
];

// ERC20 Token ABI
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// 3DPass ERC20 Precompile ABI (for all assets including P3D)
export const THREEDPASS_PRECOMPILE_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// Legacy alias for backward compatibility
export const P3D_PRECOMPILE_ABI = THREEDPASS_PRECOMPILE_ABI; 