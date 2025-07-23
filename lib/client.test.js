const { Client } = require('slmpjs');
test('Client initialization', () => {
  const c = new Client.SLMP_Client();
  expect(c).toBeDefined();
});