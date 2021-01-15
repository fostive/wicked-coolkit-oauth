const fastify = require('fastify')({
  logger: {
    prettyPrint: true
  }
})

fastify.get('/', async (request, reply) => {
  return { ok: true }
})

async function start () {
  try {
    await fastify.listen(process.env.PORT || 3000, '0.0.0.0')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
