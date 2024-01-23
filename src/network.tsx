import { vCenter } from "./api/vCenter";
import { GetServer, GetServerLocalStorage, GetSelectedServer } from "./api/function";
import { Network } from "./api/types";
import * as React from "react";
import {
  List,
  Toast,
  showToast,
  LocalStorage,
  Cache,
  Action,
  ActionPanel,
  Icon,
  getPreferenceValues,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import ServerView from "./api/ServerView";

const pref = getPreferenceValues();
if (!pref.certificate) process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

const cache = new Cache();

export default function Command(): JSX.Element {
  const { data: Server, revalidate: RevalidateServer, isLoading: IsLoadingServer } = usePromise(GetServer);
  const {
    data: ServerSelected,
    revalidate: RevalidateServerSelected,
    isLoading: IsLoadingServerSelected,
  } = usePromise(GetSelectedServer);
  const [Networks, SetNetworks]: [Network[], React.Dispatch<React.SetStateAction<Network[]>>] = React.useState(
    [] as Network[]
  );
  const [IsLoadingNetworks, SetIsLoadingNetworks]: [boolean, React.Dispatch<React.SetStateAction<boolean>>] =
    React.useState(false);

  /**
   * Set Networks.
   * @returns {Promise<void>}
   */
  async function GetNetworks(): Promise<void> {
    if (Server && ServerSelected) {
      SetIsLoadingNetworks(true);

      let cached: Network[] | undefined;
      const cachedj = cache.get(`network_${ServerSelected}_hosts`);
      if (cachedj) cached = JSON.parse(cachedj);
      if (Networks.length === 0 && cached) SetNetworks(cached);

      let s: Map<string, vCenter> = Server;
      if (ServerSelected !== "All") s = new Map([...s].filter(([k]) => k === ServerSelected));

      const networks: Network[] = [];

      await Promise.all(
        [...s].map(async ([k, s]) => {
          const networksSummary = await s.ListNetwork().catch(async (err) => {
            await showToast({ style: Toast.Style.Failure, title: `${k} - Get Hosts:`, message: `${err}` });
          });
          if (networksSummary)
            networksSummary.forEach((n) => {
              networks.push({
                server: k,
                summary: n,
              } as Network);
            });
        })
      );

      if (networks.length > 0) {
        SetNetworks(networks);
        cache.set(`network_${ServerSelected}_hosts`, JSON.stringify(networks));
      }
      SetIsLoadingNetworks(false);
    }
  }
  /**
   * Change Selected Server.
   * @param {string} value - Server Name.
   */
  async function ChangeSelectedServer(value: string) {
    await LocalStorage.setItem("server_selected", value);
    RevalidateServerSelected();
  }
  /**
   * Delete Selected Server.
   */
  async function DeleteSelectedServer() {
    if (Server && [...Server.keys()].length > 1) {
      const OldServer = await GetServerLocalStorage();
      if (OldServer) {
        const NewServer = OldServer.filter((c) => {
          return c.name !== ServerSelected;
        });
        const NewServerSelected = NewServer[0].name;
        await LocalStorage.setItem("server", JSON.stringify(NewServer));
        await LocalStorage.setItem("server_selected", NewServerSelected);
      }
    } else if (Server) {
      await LocalStorage.removeItem("server");
      await LocalStorage.removeItem("server_selected");
    }
    RevalidateServer();
    RevalidateServerSelected();
  }
  /**
   * Search Bar Accessory
   * @param {Map<string, vCenter>} server.
   * @returns {JSX.Element}
   */
  function GetSearchBar(server: Map<string, vCenter>): JSX.Element {
    const keys = [...server.keys()];
    if (keys.length > 1) keys.unshift("All");
    return (
      <List.Dropdown
        tooltip="Available Server"
        onChange={ChangeSelectedServer}
        defaultValue={ServerSelected ? ServerSelected : undefined}
      >
        {keys.map((s) => (
          <List.Dropdown.Item title={s} value={s} />
        ))}
      </List.Dropdown>
    );
  }
  /**
   * @param {Network} network.
   * @returns {List.Item.Accessory[]}
   */
  function GetHostAccessory(network: Network): List.Item.Accessory[] {
    const a: List.Item.Accessory[] = [];
    if (ServerSelected === "All") a.push({ tag: network.server, icon: Icon.Building });
    return a;
  }
  /**
   * Host Action Menu.
   * @returns {JSX.Element}
   */
  function GetHostAction(): JSX.Element {
    return (
      <ActionPanel title="vCenter Network">
        {!IsLoadingNetworks && (
          <Action
            title="Refresh"
            icon={Icon.Repeat}
            onAction={GetNetworks}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
          />
        )}
        <ActionPanel.Section title="vCenter Server">
          <Action
            title="Add Server"
            icon={Icon.NewDocument}
            onAction={() => {
              SetShowServerView(true);
            }}
          />
          <Action title="Edit Server" icon={Icon.Pencil} onAction={() => SetShowServerViewEdit(true)} />
          <Action title="Delete Server" icon={Icon.DeleteDocument} onAction={DeleteSelectedServer} />
        </ActionPanel.Section>
      </ActionPanel>
    );
  }

  React.useEffect(() => {
    if (Server && !IsLoadingServer && ServerSelected && !IsLoadingServerSelected) {
      GetNetworks();
    } else if (Server && !IsLoadingServer && !ServerSelected && !IsLoadingServerSelected) {
      const name = Object.keys(Server)[0];
      LocalStorage.setItem("server_selected", name);
      RevalidateServerSelected();
    } else if (!IsLoadingServer && !Server) {
      SetShowServerView(true);
    }
  }, [Server, IsLoadingServer, ServerSelected, IsLoadingServerSelected]);

  const [ShowServerView, SetShowServerView] = React.useState(false);
  const [ShowServerViewEdit, SetShowServerViewEdit] = React.useState(false);

  React.useEffect(() => {
    if (!ShowServerView || !ShowServerViewEdit) {
      RevalidateServer();
      RevalidateServerSelected();
    }
  }, [ShowServerView, ShowServerViewEdit]);

  if (ShowServerView) return <ServerView SetShowView={SetShowServerView} />;
  if (ShowServerViewEdit && Server) return <ServerView server={ServerSelected} SetShowView={SetShowServerViewEdit} />;

  return (
    <List
      isLoading={IsLoadingServer || IsLoadingServerSelected || IsLoadingNetworks}
      actions={GetHostAction()}
      searchBarAccessory={Server && GetSearchBar(Server)}
    >
      {Networks &&
        Networks.map((network) => (
          <List.Item
            key={`${network.server}_${network.summary.network}`}
            id={`${network.server}_${network.summary.network}`}
            title={network.summary.name}
            icon={{ source: "icons/network/network.svg" }}
            accessories={GetHostAccessory(network)}
            actions={GetHostAction()}
          />
        ))}
    </List>
  );
}
