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
