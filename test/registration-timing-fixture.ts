// Ordinary fixture replies can be descheduled while other headed tests run.
// Keep that finite allowance separate from the intentional timeout case.
// Neither value changes the runtime's default or operation deadline.
export const fixtureReplyTimeoutMs = 5_000;
export const fixtureExpiryTimeoutMs = 50;
