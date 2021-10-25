import { resolver, SecurePassword } from "blitz"
import db from "db"
import { Signup } from "app/auth/validations"
import { sendEmailWithTemplate } from "app/postmark"
import { url } from "app/url"
import algoliasearch from "algoliasearch"

import * as verifyEmail from "../verify-email"

const client = algoliasearch(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_API_ADMIN_KEY!)
const index = client.initIndex("dev_workspaces")

export default resolver.pipe(resolver.zod(Signup), async ({ email, password, handle }, ctx) => {
  const hashedPassword = await SecurePassword.hash(password.trim())
  const hexColor = Math.floor(Math.random() * 16777215).toString(16)
  const user = await db.user.create({
    data: {
      email: email.toLowerCase().trim(),
      hashedPassword,
      role: "CUSTOMER",
      memberships: {
        create: {
          role: "OWNER",
          workspace: {
            create: {
              handle,
              avatar: `https://eu.ui-avatars.com/api/?rounded=true&background=${hexColor}&name=${handle}`,
            },
          },
        },
      },
    },
    include: {
      memberships: {
        include: {
          workspace: true,
        },
      },
    },
  })

  // Index the new workspace with Algolia for search
  // Should only be one membership at this point
  user.memberships.map(async (membership) => {
    await index.saveObject({
      objectID: membership.workspace.id,
      name: membership.workspace.name,
      handle: membership.workspace.handle,
      avatar: membership.workspace.avatar,
      pronouns: membership.workspace.pronouns,
    })
  })

  const emailCode = await verifyEmail.generateCode(hashedPassword)

  await Promise.all([
    sendEmailWithTemplate(email, "welcome", {
      handle: handle,
      days: 14,
      verify_email_url: url`/verifyEmail/${emailCode}`,
    }),
    ctx.session.$create({
      userId: user.id,
      roles: [user.role, user.memberships[0]!.role],
      workspaceId: user.memberships[0]!.workspaceId,
    }),
  ])

  return user
})
