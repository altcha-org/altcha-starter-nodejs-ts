import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createChallenge, verifyFieldsHash, verifySolution, verifyServerSignature } from 'altcha-lib'

// Server configuration
const PORT = process.env.PORT || 3000

// Configure custom ALTCHA_HMAC_KEY if not set in environment variables
const ALTCHA_HMAC_KEY = process.env.ALTCHA_HMAC_KEY || randomBytes(16).toString('hex')

const app = new Hono()

// Apply CORS middleware to all routes
app.use('/*', cors())

// Root endpoint providing information about available endpoints
app.get('/', (c) => {
  return c.text([
    'ALTCHA server demo endpoints:',
    '',
    'GET /altcha - use this endpoint as challengeurl for the widget',
    'POST /submit - use this endpoint as the form action',
    'POST /submit_spam_filter - use this endpoint for form submissions with spam filtering'
  ].join('\n'))
})

/**
 * GET /altcha
 * 
 * Endpoint for fetching a new random challenge to be used by the ALTCHA widget
 */
app.get('/altcha', async (c) => {
  try {
    // Generate a new random challenge with a specified complexity
    const challenge = await createChallenge({
      hmacKey: ALTCHA_HMAC_KEY,
      maxNumber: 50_000
    })

    // Return the generated challenge as JSON
    return c.json(challenge)
  } catch (error: any) {
    // Handle any errors that occur during challenge creation
    return c.json({
      error: 'Failed to create challenge',
      details: error.message
    }, 500)
  }
})

/**
 * POST /submit
 * 
 * Endpoint for form submissions that verifies the simple PoW challenge without the spam filter
 */
app.post('/submit', async (c) => {
  try {
    // Read form data from the request
    const formData = await c.req.formData()

    // Get the 'altcha' field containing the verification payload from the form data
    const altcha = formData.get('altcha')

    // If the 'altcha' field is missing, return an error
    if (!altcha) {
      return c.json({
        error: 'Altcha payload missing',
      }, 400)
    }

    // Verify the solution using the secret HMAC key
    const verified = await verifySolution(String(altcha), ALTCHA_HMAC_KEY)

    // If verification fails, return an error
    if (!verified) {
      return c.json({
        error: 'Invalid Altcha payload',
      }, 400)
    }

    // Altcha payload successfully verified
    // Here you would process the form data

    // For demo purposes, return the form data and success status
    return c.json({
      success: true,
      data: Object.fromEntries(formData),
    })
  } catch (error: any) {
    // Handle any errors that occur during submission processing
    return c.json({
      error: 'Failed to process submission',
      details: error.message
    }, 500)
  }
})

/**
 * POST /submit_spam_filter
 * 
 * Endpoint for form submissions that verifies the server signature generated by the spam filter
 */
app.post('/submit_spam_filter', async (c) => {
  try {
    // Read form data from the request
    const formData = await c.req.formData()

    // Get the 'altcha' field containing the verification payload from the form data
    const altcha = formData.get('altcha')

    // If the 'altcha' field is missing, return an error
    if (!altcha) {
      return c.json({
        error: 'Altcha payload missing',
      }, 400)
    }

    // Verify the server signature using the API secret
    const { verificationData, verified } = await verifyServerSignature(String(altcha), ALTCHA_HMAC_KEY)

    // If verification fails or no verification data is returned, return an error
    if (!verified || !verificationData) {
      return c.json({
        error: 'Invalid Altcha payload',
      }, 400)
    }

    // Altcha payload successfully verified
    const { classification, fields, fieldsHash } = verificationData

    if (classification === 'BAD') {
      // If classified as spam, reject the submission
      return c.json({
        error: 'Classified as spam',
      }, 400)

    } else if (fields && fieldsHash && !await verifyFieldsHash(formData, fields, fieldsHash)) {
      // Looks like the fields has been changed since the Spam Filter checked the data
      return c.json({
        error: 'Invalid fields hash',
      }, 400)

    } else {
      // Everything is okay, process the submission
    }

    // For demo purposes, return the form data, success status, and verification data
    return c.json({
      success: true,
      data: Object.fromEntries(formData),
      verificationData,
    })
  } catch (error: any) {
    // Handle any errors that occur during submission processing
    return c.json({
      error: 'Failed to process submission with spam filter',
      details: error.message
    }, 500)
  }
})

// Log the server start message with the port number
console.log(`Server is running on port ${PORT}`)

// Start the server
serve({
  fetch: app.fetch,
  port: +PORT,
})
