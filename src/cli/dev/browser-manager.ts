import Browserbase from "@browserbasehq/sdk";
import chalk from "chalk";

export interface SessionConfig {
  [key: string]: unknown;
}

export interface Session {
  id: string;
  connectUrl: string;
}

/**
 * Interface for managing remote browser sessions
 */
export interface IRemoteBrowserManager {
  /**
   * Initialize the browser manager and check credentials
   */
  initialize(): Promise<void>;

  /**
   * Create a new browser session
   */
  createSession(sessionConfig?: SessionConfig): Promise<Session>;

  /**
   * Close a browser session
   */
  closeSession(sessionId: string): Promise<void>;

  /**
   * Get the project ID
   */
  getProjectId(): string;

  /**
   * Check if the manager is initialized
   */
  isInitialized(): boolean;
}

/**
 * Manages remote browser sessions using Browserbase
 */
export class RemoteBrowserManager implements IRemoteBrowserManager {
  private browserbaseClient: Browserbase | null = null;
  private projectId: string;
  private apiKey: string;
  private initialized: boolean = false;

  constructor() {
    const foundProjectId = process.env["BB_PROJECT_ID"];
    const foundApiKey = process.env["BB_API_KEY"];

    if (!foundProjectId || !foundApiKey) {
      console.error(
        chalk.red("✗ Browserbase credentials not found.\n") +
          chalk.red(
            "  Please set BB_PROJECT_ID and BB_API_KEY in your .env file.\n",
          ) +
          chalk.gray(
            "  Copy .env.example to .env and fill in your credentials.",
          ),
      );
      throw new Error("Missing Browserbase credentials");
    }

    this.projectId = foundProjectId;
    this.apiKey = foundApiKey;
  }

  /**
   * Initialize the browser manager and check credentials
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Creating a new Browserbase client is sufficient to assume connection
    this.browserbaseClient = new Browserbase({
      apiKey: this.apiKey,
    });

    this.initialized = true;
    console.log(chalk.green("✓ Browserbase client initialized"));
  }

  /**
   * Create a new browser session
   */
  public async createSession(sessionConfig?: SessionConfig): Promise<Session> {
    if (!this.browserbaseClient) {
      throw new Error("Browser manager not initialized");
    }

    console.log(chalk.cyan(`Creating browser session...`));

    const createdSession = await this.browserbaseClient.sessions.create({
      projectId: this.projectId,
      ...sessionConfig,
    });

    const session: Session = {
      id: createdSession.id,
      connectUrl: createdSession.connectUrl,
    };

    console.log(chalk.green(`✓ Browser session created: ${session.id}`));
    return session;
  }

  /**
   * Close a browser session
   */
  public async closeSession(sessionId: string): Promise<void> {
    if (!this.browserbaseClient) {
      throw new Error("Browser manager not initialized");
    }

    try {
      console.log(chalk.cyan(`Closing browser session: ${sessionId}...`));
      await this.browserbaseClient.sessions.update(sessionId, {
        projectId: this.projectId,
        status: "REQUEST_RELEASE",
      });
      console.log(chalk.green(`✓ Browser session closed: ${sessionId}`));
    } catch (error) {
      // Session might already be closed or expired, log but don't throw
      console.warn(
        chalk.yellow(`⚠️  Could not close session ${sessionId}:`),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Get the project ID
   */
  public getProjectId(): string {
    return this.projectId;
  }

  /**
   * Check if the manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
}

