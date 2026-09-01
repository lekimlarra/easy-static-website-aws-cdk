## Create a Simple Login and Signup Form in React

This section describes how to build a small React form that allows users to **sign up** and **log in** using Cognito. It will rely on the `authService.ts` we created earlier.

---

### 📦 authService.ts

This file is a small wrapper around `amazon-cognito-identity-js` that provides functions to:

- Register a user (`signUp`)
- Log in a user (`signIn`)
- Log out (`signOut`)

```typescript
import { CognitoUserPool, CognitoUser, AuthenticationDetails, ISignUpResult } from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID!,
  ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID!,
};

const userPool = new CognitoUserPool(poolData);

export const signUp = (email: string, password: string, name: string): Promise<ISignUpResult> => {
  return new Promise((resolve, reject) => {
    userPool.signUp(
      email,
      password,
      [
        { Name: "email", Value: email },
        { Name: "given_name", Value: name },
      ],
      null,
      (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result!);
      }
    );
  });
};

export const signIn = (email: string, password: string): Promise<string> => {
  const user = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve(session.getIdToken().getJwtToken());
      },
      onFailure: (err) => {
        reject(err);
      },
    });
  });
};

export const signOut = () => {
  const user = userPool.getCurrentUser();
  if (user) {
    user.signOut();
  }
};
```

### 📝 LoginForm.tsx Component

This component allows users to:

- Sign up with email, password, and name.
- Log in with email and password.
- Switch between login and signup modes.

```typescript
import React, { useState } from "react";
import { signIn, signUp } from "./authService";

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const handleSubmit = async () => {
    try {
      if (mode === "register") {
        await signUp(email, password, name);
        alert("Signup successful! Please check your email to verify your account.");
      } else {
        const token = await signIn(email, password);
        console.log("Received token:", token);
        alert("Login successful!");
      }
    } catch (error) {
      console.error(error);
      alert("Error: " + (error as any)?.message);
    }
  };

  return (
    <div>
      <h2>{mode === "login" ? "Log In" : "Sign Up"}</h2>

      {mode === "register" && <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}

      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={handleSubmit}>{mode === "login" ? "Log In" : "Sign Up"}</button>

      <p onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}</p>
    </div>
  );
};
```

### 🌐 Summary

- This form works seamlessly with the Cognito User Pool created via CDK.
- It uses signUp to register new users.
- It uses signIn to get a JWT token, which can then be used to call protected APIs.
- You can store the token in localStorage or sessionStorage, depending on your needs.

### 📦 Required Environment Variables

Make sure you have the following variables in `.env.local`:

- `REACT_APP_COGNITO_USER_POOL_ID`
- `REACT_APP_COGNITO_CLIENT_ID`

And, if you enabled the Google login (`createGoogleLogin=true`):

- `REACT_APP_COGNITO_DOMAIN` — the `CognitoHostedUiDomain` output, `https://<prefix>.auth.<region>.amazoncognito.com`
- `REACT_APP_COGNITO_REDIRECT_URI` — the same URL you configured as `cognitoCallBackPath`, for example `http://localhost:3000/auth/callback` while developing
- `REACT_APP_COGNITO_LOGOUT_URI` — where the user lands after logging out

`npm run outputs` prints the first one after every deploy.

---

## Log in with Google

The form above talks to Cognito directly, which only works for email and password: a Google login has to go through Google, so the browser leaves your site and comes back with an authorization code.

The whole trip is:

1. Your site sends the user to the Cognito hosted UI with `identity_provider=Google`.
2. Cognito forwards them to Google, the user picks an account.
3. Google returns to Cognito at `/oauth2/idpresponse`.
4. Cognito creates or finds the user and redirects to **your** callback URL with a `?code=...`.
5. Your site exchanges that code for the tokens.

The tokens that come back are ordinary Cognito tokens: the `id_token` is what your API Gateway authorizer expects, exactly like the one `signIn` returns.

### 🔐 A note on PKCE

The app client this project creates has no client secret, because a secret cannot be kept in a browser. That makes PKCE the thing that stops an intercepted code from being usable: the site invents a random `code_verifier`, sends only its hash when starting the login, and reveals the original when exchanging the code. It is a few lines and the example below includes it.

### 📦 googleAuthService.ts

```typescript
const domain = process.env.REACT_APP_COGNITO_DOMAIN!;
const clientId = process.env.REACT_APP_COGNITO_CLIENT_ID!;
const redirectUri = process.env.REACT_APP_COGNITO_REDIRECT_URI!;
const logoutUri = process.env.REACT_APP_COGNITO_LOGOUT_URI!;

const VERIFIER_KEY = "cognito_pkce_verifier";

const base64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const createPkcePair = async () => {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(digest) };
};

/** Step 1: leave the site towards Google. */
export const loginWithGoogle = async (): Promise<void> => {
  const { verifier, challenge } = await createPkcePair();
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    identity_provider: "Google", // drop this line to show the Cognito page with every option
    client_id: clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.assign(`${domain}/oauth2/authorize?${params}`);
};

/** Step 2: called on your callback page, turns the code into tokens. */
export const completeLogin = async (): Promise<{ id_token: string; access_token: string; refresh_token: string; expires_in: number }> => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) throw new Error(params.get("error_description") ?? error);

  const code = params.get("code");
  if (!code) throw new Error("No authorization code in the URL");

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier: the login was started in another tab or session");

  const response = await fetch(`${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri, // must be identical to the one used above
      code_verifier: verifier,
    }),
  });

  if (!response.ok) throw new Error(`Token exchange failed: ${await response.text()}`);

  sessionStorage.removeItem(VERIFIER_KEY);
  return response.json();
};

/** Ends the Cognito session, not only the local one. */
export const logoutFromHostedUi = (): void => {
  const params = new URLSearchParams({ client_id: clientId, logout_uri: logoutUri });
  window.location.assign(`${domain}/logout?${params}`);
};
```

### 📝 The button and the callback page

```typescript
import React, { useEffect, useState } from "react";
import { loginWithGoogle, completeLogin } from "./googleAuthService";

export const GoogleButton: React.FC = () => <button onClick={loginWithGoogle}>Continue with Google</button>;

/** Render this on the route configured in cognitoCallBackPath. */
export const AuthCallback: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeLogin()
      .then((tokens) => {
        sessionStorage.setItem("id_token", tokens.id_token);
        // Clears the ?code= from the URL so a refresh does not replay it
        window.history.replaceState({}, "", window.location.pathname);
        window.location.assign("/");
      })
      .catch((problem) => setError(problem.message));
  }, []);

  return error ? <p>Could not finish the login: {error}</p> : <p>Signing you in…</p>;
};
```

Then send `id_token` as the `Authorization` header when calling your API, the same way you would with the token returned by `signIn`.

### ⚠️ Things that usually go wrong

| Symptom | Cause |
| --- | --- |
| `redirect_mismatch` | The `redirect_uri` is not in the app client's callback URLs. Add it to `cognitoExtraCallbackUrls` and deploy again |
| Google shows "Access blocked" | The OAuth consent screen is still in *Testing* and the account is not in the test users list |
| `invalid_grant` on the token exchange | The `redirect_uri` sent to `/oauth2/token` is not byte for byte the one used to start the login, or the code was already used |
| "An account with the email already exists" | The address already signed up with a password. Cognito does not link the two by itself |
| The user never reaches the `users` table | Federated users fire `PreSignUp`, not `PostConfirmation`. The stack wires both when Google is enabled |
