// app/routes/auth.login/route.jsx
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import { Form, useActionData, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "../../shopify.server"; // ✅ UPDATED IMPORT

export const loader = async ({ request }) => {
  console.log('🔐 Auth.login loader - Manual login page');
  const errors = loginErrorMessage(await login(request));
  console.log('🔐 Auth.login - Errors:', errors);

  return { errors };
};

export const action = async ({ request }) => {
  console.log('🔐 Auth.login action - Form submitted');
  const errors = loginErrorMessage(await login(request));
  console.log('🔐 Auth.login action - Errors:', errors);

  return {
    errors,
  };
};

export default function AuthLogin() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  console.log('🔐 AuthLogin component - Errors:', errors);
  console.log('🔐 AuthLogin component - Shop state:', shop);

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading="Log in">
            <s-text-field
              name="shop"
              label="Shop domain"
              details="example.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
