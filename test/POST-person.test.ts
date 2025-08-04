const { handler } = require("../resources/lambdas/POST-person");

describe("POST-person Lambda", () => {
  it("should return status 200 and echo the body", async () => {
    const event = { body: JSON.stringify({ name: "John3" }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      message: "Hello from Node.js 20 Lambda!",
      body: event.body,
    });
  });
});
