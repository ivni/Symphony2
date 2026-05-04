# Symphony2

Symphony2 is a draft specification for a small ticket runner inspired by OpenAI Symphony, but
scoped to our workflow:

- one repository checkout;
- one active ticket at a time;
- no parallel agent work;
- manual agent selection per ticket;
- support for multiple agent backends;
- durable state and repository safety checks.

The main document is [SPEC.md](SPEC.md).

This repo is a clean spec workspace for designing our own sequential agent runner.

## Current Shape

Keep the project small until the workflow is proven:

1. define the spec;
2. review the ticket lifecycle;
3. choose the first tracker adapter;
4. choose the first agent adapter;
5. implement the minimal runner.

## License

License is not selected yet.
