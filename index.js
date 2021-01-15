const fetch = require('node-fetch')
const fastify = require('fastify')({
  logger: {
    prettyPrint: true
  }
})

fastify.register(require('fastify-formbody'))

const loginUrl = process.env.LOGIN_URL || 'https://login.salesforce.com'
const clientId = process.env.CLIENT_ID
const redirectUri = process.env.REDIRECT_URI || 'http://localhost:3000/callback' // FIXME: should automatically get server URL
const scope = process.env.SCOPE || 'api refresh_token offline_access'

/*
 * Start oauth process. 302 redirects user to Salesforce login.
 *
 * Expected query string params:
 *  - redirect_uri
 *  - login_url (optional)
 */
const connectOpts = {
  schema: {
    querystring: {
      type: 'object',
      required: ['redirect_uri'],
      properties: {
        redirect_uri: { type: 'string' },
        login_url: {
          type: 'string',
          enum: ['https://login.salesforce.com', 'https://test.salesforce.com']
        }
      }
    }
  }
}
fastify.get('/connect', connectOpts, async (request, reply) => {
  const authUrl = request.query.login_url || loginUrl

  reply.redirect(302, `${authUrl}/services/oauth2/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&scope=${scope}` +
    '&response_type=code' +
    '&response_mode=query' +
    `&state=${authUrl}|${request.query.redirect_uri}`)
})

/*
 * Callback that Salesforce redirects user to after login. `code` is then POSTed
 * to the token endpoint to get an `access_token`. User is then
 * redirected back to original site.
 *
 * Expected query string params:
 *  - code
 *  - state - two values, pipe delimited. first is SF login URL. second is user app callback URL
 *      e.g. https://test.salesforce.com|https://usercoolkit.herokuapp.com
 */
const callbackOpts = {
  schema: {
    querystring: {
      type: 'object',
      required: ['code', 'state'],
      properties: {
        code: { type: 'string' },
        state: { type: 'string' }
      }
    }
  }
}
fastify.get('/callback', callbackOpts, async (request, reply) => {
  const state = request.query.state.split('|')
  const authUrl = state[0]
  const userUrl = state[1]

  const params = new URLSearchParams()
  params.append('grant_type', 'authorization_code')
  params.append('code', request.query.code)
  params.append('client_id', clientId)
  params.append('redirect_uri', redirectUri)

  const response = await fetch(`${authUrl}/services/oauth2/token`, {
    method: 'POST',
    body: params
  })

  let json
  if (response.ok) {
    json = await response.json()
  } else {
    fastify.log.error('Error getting access_token')
    const bodyText = await response.text()
    fastify.log.error('Error response body: bodyText')
    throw new HTTPResponseError(bodyText)
  }

  reply.redirect(302, `${userUrl}` +
    `?access_token=${json.access_token}` +
    `&refresh_token=${json.refresh_token}` +
    `&instance_url=${json.instance_url}`)
})

/*
 * Get a new access_token using a refresh_token.
 *
 * Expected data:
 *  - refresh_token
 *  - login_url (optional)
 */
const refreshOpts = {
  schema: {
    body: {
      type: 'object',
      required: ['refresh_token'],
      properties: {
        refresh_token: { type: 'string' },
        login_url: {
          type: 'string',
          enum: ['https://login.salesforce.com', 'https://test.salesforce.com']
        }
      }
    }
  }
}
fastify.post('/refresh', refreshOpts, async (request, reply) => {
  const authUrl = request.body.login_url || loginUrl

  const params = new URLSearchParams()
  params.append('grant_type', 'refresh_token')
  params.append('refresh_token', request.body.refresh_token)
  params.append('client_id', clientId)

  const response = await fetch(`${authUrl}/services/oauth2/token`, {
    method: 'POST',
    body: params
  })

  let json
  if (response.ok) {
    json = await response.json()
  } else {
    fastify.log.error('Error refreshing access_token')
    const bodyText = await response.text()
    fastify.log.error('Error response body: bodyText')
    throw new HTTPResponseError(bodyText)
  }

  reply.send({
    access_token: json.access_token,
    instance_url: json.instance_url
  })
})

fastify.get('/', async (request, reply) => {
  return { ok: true }
})

class HTTPResponseError extends Error {
  constructor (bodyText, ...args) {
    super(`HTTP Error Response: ${bodyText}`, ...args)
  }
}

async function start () {
  try {
    await fastify.listen(process.env.PORT || 3000, '0.0.0.0')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
