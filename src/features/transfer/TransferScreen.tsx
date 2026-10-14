import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ScreenBody } from "@/components/layout/screen";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/lib/i18n";
import type { ScreenProps } from "@/App";
import "./messages";
import { BrowsePanel } from "./BrowsePanel";
import { RecvPanel } from "./RecvPanel";
import { SendPanel } from "./SendPanel";

type TransferTab = "recv" | "send" | "browse";

export default function TransferScreen(_props: ScreenProps) {
  const t = useT();
  const [tab, setTab] = useState<TransferTab>("recv");

  return (
    <>
      <PageHeader
        title={t("transfer.title")}
        description={t("transfer.description")}
      />
      <ScreenBody>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as TransferTab)}
        >
          <TabsList>
            <TabsTrigger value="recv">{t("transfer.tab.recv")}</TabsTrigger>
            <TabsTrigger value="send">{t("transfer.tab.send")}</TabsTrigger>
            <TabsTrigger value="browse">{t("transfer.tab.browse")}</TabsTrigger>
          </TabsList>
          {/* forceMount keeps each panel's state (picked paths, listing) alive. */}
          <TabsContent
            value="recv"
            forceMount
            hidden={tab !== "recv"}
            className="mt-4 flex flex-col gap-4"
          >
            <RecvPanel />
          </TabsContent>
          <TabsContent
            value="send"
            forceMount
            hidden={tab !== "send"}
            className="mt-4 flex flex-col gap-4"
          >
            <SendPanel />
          </TabsContent>
          <TabsContent
            value="browse"
            forceMount
            hidden={tab !== "browse"}
            className="mt-4 flex flex-col gap-4"
          >
            <BrowsePanel />
          </TabsContent>
        </Tabs>
      </ScreenBody>
    </>
  );
}
