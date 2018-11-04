import fetch, { Response } from "node-fetch";

function handleJson(response: Response) {
  try {
    return response.json();
  } catch (e) {
    if (response.status > 399)
      throw new Error("Fetch error: " + response.statusText);
    throw new Error("Error when converting response to JSON");
  }
}

class GraphQLError extends Error {
  errors: any[];

  constructor(errors: any[]) {
    super("GraphQL Error");
    this.errors = errors;
  }
}

export default async function graphqlFetch<T>(
  host: string,
  query: string,
  variables: any = {},
  jwt?: string
) {
  const result = (await fetch(`${host}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
    },
    body: JSON.stringify({ query, variables })
  }).then(handleJson)) as { data: T; errors?: any };
  if (result.errors) {
    throw new GraphQLError(result.errors);
  }
  return result.data;
}
