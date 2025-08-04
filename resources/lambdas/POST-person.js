//const { sum } = require('Utils/utils');
const { sum } = require('./Utils/utils');

exports.handler = async (event) => {
  console.log("Received body:", event.body);
  
  const result = sum(3, 5);
  console.log("Shared code working if this is 8!:", result)
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from Node.js 20 Lambda!", body: event.body }),
  };
};