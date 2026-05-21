import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    // Raw request body, preserved for Stripe webhook signature verification.
    rawBody?: Buffer;
  }
}
