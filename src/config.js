const fs = require('fs');
const { get, fetchRemotePacakge } = require('./api');
const { promisify } = require('util');
const inquirer = require('inquirer');
const boxen = require('boxen');
const packageJson = require('../package.json');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

async function findDeal(search, headers, today) {
  const matchingDeal = await get(
    `deals?filter[query]=${search}&filter[date][lt_eq]=${today}&filter[end_date][gt_eq]=${today}`,
    headers
  );
  return matchingDeal.data.map((d) => ({
    value: d.id,
    name: `${d.attributes.name} ${d.attributes.date}`,
  }));
}

async function findService(dealId, headers) {
  const matchingService = await get(`services?filter[deal_id]=${dealId}`, headers);
  return matchingService.data.map((d) => ({ value: d.id, name: d.attributes.name }));
}

async function mapOrganizationMembershipChoices(orgMemberships) {
  return orgMemberships.data.map((orgMembership) => ({
    value: orgMembership.id,
    name: `${orgMemberships.included.filter(el => el.type === 'organizations').find(el => el.id === orgMembership.relationships.organization.data.id).attributes.name}`,
  }));
}

async function createConfig() {
  const { token } = await inquirer.prompt([
    { type: 'input', message: 'Productive.io token', name: 'token', type: 'password' },
  ]);

  const organizationMemberships = await get('organization_memberships', {
    'Content-Type': 'application/vnd.api+json',
    'X-Auth-Token': token,
  });

  if (!organizationMemberships.data) {
    console.log('Something went wrong... Check your token!');
    return;
  }

  const organizationMembershipChoices = await mapOrganizationMembershipChoices(organizationMemberships);

  const { organizationMembershipId } = await inquirer.prompt([
    { type: 'list', message: 'Select organization:', name: 'orgId', choices: organizationMembershipChoices },
  ]);

  return {
    token,
    orgId: organizationMemberships.data.find(el => el.id === organizationMembershipId).relationships.organization.data.id,
    userId: organizationMemberships.data.find(el => el.id === organizationMembershipId).relationships.person.data.id,
    services: [],
  };
}

async function getConfig(configPath) {
  try {
    const file = await readFile(configPath, { encoding: 'utf-8' });
    const config = JSON.parse(file);

    return config;
  } catch (e) {
    return null;
  }
}

async function createNewProjectEntry(today, headers, configPath, config) {
  const { query } = await inquirer.prompt([
    { type: 'input', message: 'Search for a project by name', name: 'query' },
  ]);
  const deals = await findDeal(query, headers, today);

  const { dealId } = await inquirer.prompt([
    { type: 'list', message: 'Select a project', name: 'dealId', choices: deals },
  ]);

  const services = await findService(dealId, headers);
  const { serviceId } = await inquirer.prompt([
    { type: 'list', message: 'Select a service', name: 'serviceId', choices: services },
  ]);

  const newConfig = {
    ...config,
    services: [
      ...(config.services || []),
      {
        serviceId: serviceId,
        serviceName: services.find((s) => s.value === serviceId).name,
        dealName: deals.find((d) => d.value === dealId).name,
      },
    ],
  };

  await writeFile(configPath, JSON.stringify(newConfig));
}

async function initConfig(configPath) {
  try {
    const initConfig = await createConfig();
    await writeFile(configPath, JSON.stringify(initConfig));
  } catch (e) {
    return null;
  }
}

async function detectNewVersion() {
  const remote = await fetchRemotePacakge();

  if (remote.version === packageJson.version) {
    return;
  }

  let alert = `New version \x1b[31m${remote.version}\x1b[0m is out!\n`
  alert += 'Run \x1b[33mnpm install -g andreicek/productive-cli\x1b[0m';
  console.log(boxen(alert, { padding: 1}));
}

module.exports = {
  detectNewVersion,
  findDeal,
  findService,
  createConfig,
  getConfig,
  createNewProjectEntry,
  initConfig,
};
