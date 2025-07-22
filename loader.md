The Loader API is a powerful pattern in the @daydreamsai/core library that allows you to pre-fetch and prepare
data before the agent needs to take any actions. Here are examples and some docs from a *different* agent showcasing Loaf is demonstrating,:

Key Concept

The loader function runs before the agent processes any actions in a context. It automatically fetches and updates
the context's memory with fresh data, eliminating the need for the agent to make explicit action calls to
retrieve this information.

How It Works

Looking at the examples:

1. game_map_context.loader:


    - Automatically fetches the player's current location
    - Retrieves tiles within a radius around the player
    - Identifies occupied tiles and explorers
    - Fetches troop information
    - Builds a grid of the game map
    - Updates the memory with all this data

2. player_context.loader:


    - Fetches the explorer's current state (location, stamina, troops)
    - Retrieves resource balances and storage
    - Updates the player's memory with fresh data

Benefits

1. Reduced Actions: The agent doesn't need to call actions like "get_tiles" or "get_player_status" because the
   data is already loaded
2. Lower Costs: Fewer action calls = fewer model tokens = lower costs
3. Better Performance: The agent can make decisions immediately without waiting for data fetches
4. Cleaner Logic: The agent focuses on decision-making rather than data retrieval

Example Flow

Without loader:
Agent: "I need to move"
Agent: calls action "get_current_location"
Agent: calls action "get_stamina"
Agent: calls action "get_nearby_tiles"
Agent: "Now I can decide where to move"
Agent: calls action "moveTo"

With loader:
Loader: Pre-fetches location, stamina, and tiles
Agent: "I already have all the data, moving to X,Y"
Agent: calls action "moveTo"

This pattern is especially powerful for game agents where you often need consistent baseline data (player state,
map info, inventory) before making any decisions.

## Context-Related APIs in daydreamsai/core

Based on the examples, here are the key context APIs and how they're used:

## 1. Context Creation

```typescript
context({
  type: string,
  schema: ZodSchema,
  key: (args) => string,
  description: string,
  instructions: string,
  maxWorkingMemorySize: number,
  maxSteps: number,
});
```

## 2. Lifecycle Methods

### setup

Runs once when context is initialized:

```typescript
async setup(args, settings, agent) {
  return {
    account: await getExplorerAccount({ agent, explorer_id: args.playerId }),
    client: agent.container.resolve<ChatClient>("eternum.chat"),
  };
}
```

### create

Creates initial memory state:

```typescript
async create({ args }, agent) {
  return {
    id: args.playerId,
    current_location: location,
    stats: { stamina, storage_capacity },
    resources: balances,
  };
}
```

### loader

Pre-fetches data before actions (the key optimization!):

```typescript
async loader({ args, memory }, agent) {
  const player = await eternum.getExplorer(args.playerId);
  memory.current_location = player.location;
  memory.stats.stamina = player.stamina;
}
```

### save

Persists context state:

```typescript
async save(state) {
}
```

## 3. Action Configuration

### Using setActions:

```typescript
context({...}).setActions([
  action({
    name: "player.moveTo",
    schema: { x: z.number(), y: z.number() },
    queueKey: "eternum.player",
    handler(args, ctx) {
      return { success: true };
    },
  }),
])
```

### Inline actions:

```typescript
context({
  actions: [
    action({
      name: "game_map.get_tiles",
      handler(args, ctx) {
        return { tiles: ctx.memory.grid };
      },
    }),
  ],
});
```

## 4. Context Composition with .use()

Contexts can include other contexts:

```typescript
eternumSession.use(({ args }) => [
  { context: game_rules_and_directives, args: {} },
  { context: player_context, args: { playerId: args.explorerId } },
  { context: game_map_context, args: { playerId: args.explorerId } },
]);
```

## 5. Input/Output Configuration

### Inputs

Handle external events:

```typescript
inputs: {
  "chat.message": input({
    schema: z.object({ chat: z.object({...}) }),
    subscribe(send, agent) {
      // build listener
      chatClient.startMessageStream((data) => {
        send(context, args, processedData);
      });
      return () => { /* cleanup */ };
    },
  }),
}
```

### Outputs

Define response types:

```typescript
outputs: {
  message: output({
    schema: z.string(),
    handler(content) {
      console.log("message:\n" + content);
      return { data: content };
    },
  }),
}
```

## 6. Extensions

Bundle contexts for reuse:

```typescript
export const chatExtension = extension({
  name: "chat",
  contexts: {
    chat: chat_global_context,
  },
});
```

## 7. Services & Dependency Injection

Register services that contexts can use:

```typescript
service({
  register(container) {
    container.singleton("eternum.chat", () => {
      return new ChatClient(token, username);
    });
  },
});
```

## Key Benefits

- **Loader**: Reduces action calls by pre-fetching data
- **Composition**: Modular, reusable contexts
- **Hooks**: Fine control over initialization and updates
