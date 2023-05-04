import { api } from "app/blitz-server"
import { NextApiRequest, NextApiResponse } from "next"
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, { apiVersion: "2020-03-02" })
import db from "db"
import { getSession } from "@blitzjs/auth"

const CreateSessionModule = async (req: NextApiRequest, res: NextApiResponse) => {
  if (
    !req.query.email ||
    !(req.query.price_id || (req.query.price_data && req.query.prod_id)) ||
    !req.query.suffix ||
    !req.query.module_id
  ) {
    res.status(500).end("Incomplete request")
  } else {
    if (req.method === "POST" && req.query.price_id) {
      try {
        const license = await db.license.findFirst({
          where: {
            price_id: req.query.price_id as string,
          },
        })
        // Create Checkout Sessions from body params.
        const session = await stripe.checkout.sessions.create({
          customer_email: req.query.email,
          submit_type: "pay",
          billing_address_collection: "auto",
          line_items: [
            {
              price: req.query.price_id,
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${req.headers.origin}/modules/${req.query.suffix}?success=true`,
          cancel_url: `${req.headers.origin}/drafts?suffix=${req.query.suffix}`,
          automatic_tax: { enabled: true },
          payment_intent_data: {
            metadata: {
              description: `License fee for ${process.env.DOI_PREFIX}/${req.query.suffix}`,
              suffix: req.query.suffix,
              doi: `${process.env.DOI_PREFIX}/${req.query.suffix}`,
              module_id: req.query.module_id,
              product: "module-license",
              id: license?.name,
            },
          },
          tax_id_collection: {
            enabled: true,
          },
        })
        res.status(200).json({ url: session.url })
      } catch (err) {
        res.status(err.statusCode || 500).json(err.message)
      }
    } else if (req.method === "POST" && req.query.price_data && req.query.prod_id) {
      try {
        // Create Checkout Sessions from body params.
        const session = await stripe.checkout.sessions.create({
          customer_email: req.query.email,
          submit_type: "pay",
          billing_address_collection: "auto",
          line_items: [
            {
              price_data: {
                unit_amount: (req.query.price_data as any) * 100,
                currency: "eur",
                // TODO: This is hardcoded but could be better
                // Still needs updating for the production
                product: req.query.prod_id,
                tax_behavior: "inclusive",
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${req.headers.origin}/modules/${req.query.suffix}?success=true`,
          cancel_url: `${req.headers.origin}/drafts?suffix=${req.query.suffix}`,
          automatic_tax: { enabled: true },
          payment_intent_data: {
            metadata: {
              description: `License fee for ${process.env.DOI_PREFIX}/${req.query.suffix}`,
              suffix: req.query.suffix,
              doi: `${process.env.DOI_PREFIX}/${req.query.suffix}`,
              module_id: req.query.module_id,
              product: "module-license",
            },
          },
          tax_id_collection: {
            enabled: true,
          },
        })
        res.status(200).json({ url: session.url })
      } catch (err) {
        res.status(err.statusCode || 500).json(err.message)
      }
    } else {
      res.setHeader("Allow", "POST")
      res.status(405).end("Method Not Allowed")
    }
  }
}

export default api(CreateSessionModule)
