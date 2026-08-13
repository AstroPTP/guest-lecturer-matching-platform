"use client";

import Image, { type StaticImageData } from "next/image";
import { useState } from "react";
import groupIcon from "@/assets/group.png";
import notificationIcon from "@/assets/notification.png";
import ruleIcon from "@/assets/rule.png";
import schoolIcon from "@/assets/school.png";
import {
  defaultAdminConfiguration,
  notificationSettingDefinitions,
  registrationSettingDefinitions,
} from "@/data/settings";
import type { AdminConfiguration } from "@/types/admin";

const settingsNav: Array<{ label: string; href: string; icon: StaticImageData }> = [
  { label: "General", href: "#general", icon: ruleIcon },
  { label: "Registration", href: "#registration", icon: groupIcon },
  { label: "Notifications", href: "#notifications", icon: notificationIcon },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("#general");
  const [configuration, setConfiguration] = useState<AdminConfiguration>(defaultAdminConfiguration);
  const [saved, setSaved] = useState(false);

  function saveConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  function discardChanges() {
    setConfiguration(defaultAdminConfiguration);
    setSaved(false);
  }

  return (
    <form className="settings-page" onSubmit={saveConfiguration}>
      <header className="settings-heading">
        <h1>Configuration</h1>
        <p>Manage platform identity, account registration and user notifications.</p>
      </header>

      <div className="settings-layout">
        <nav className="settings-local-nav" aria-label="Configuration sections">
          {settingsNav.map((item) => (
            <a
              aria-current={activeSection === item.href ? "location" : undefined}
              className={activeSection === item.href ? "active" : ""}
              href={item.href}
              key={item.label}
              onClick={() => setActiveSection(item.href)}
            >
              <Image alt="" aria-hidden="true" src={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="settings-sections">
          <section className="settings-card" id="general">
            <header>
              <h2>General Configuration</h2>
              <p>Core Curtin University identity and support details for the platform.</p>
            </header>
            <div className="settings-field">
              <label htmlFor="system-name">System name</label>
              <div>
                <input
                  id="system-name"
                  onChange={(event) => setConfiguration((current) => ({ ...current, systemName: event.target.value }))}
                  value={configuration.systemName}
                />
                <small>This name appears in browser tabs and system-wide headers.</small>
              </div>
            </div>
            <div className="settings-field">
              <label htmlFor="support-email">Support email</label>
              <div>
                <input
                  id="support-email"
                  onChange={(event) => setConfiguration((current) => ({ ...current, supportEmail: event.target.value }))}
                  type="email"
                  value={configuration.supportEmail}
                />
                <small>Primary address for user support requests and platform enquiries.</small>
              </div>
            </div>
            <div className="settings-field branding-field">
              <span>University logo</span>
              <div>
                <label className="logo-upload">
                  <Image alt="" aria-hidden="true" src={schoolIcon} />
                  <span>{configuration.universityLogo ?? "Upload logo"}</span>
                  <input
                    accept="image/*"
                    onChange={(event) =>
                      setConfiguration((current) => ({
                        ...current,
                        universityLogo: event.target.files?.[0]?.name ?? null,
                      }))
                    }
                    type="file"
                  />
                </label>
                <small>Upload the Curtin University logo used in platform headers.</small>
              </div>
            </div>
          </section>

          <section className="settings-card" id="registration">
            <header>
              <h2>Registration Configuration</h2>
              <p>Control account registration, verification and approval requirements.</p>
            </header>
            <div className="protocol-list">
              {registrationSettingDefinitions.map((setting) => (
                <Protocol
                  checked={configuration.registration[setting.key]}
                  description={setting.description}
                  key={setting.key}
                  label={setting.label}
                  onChange={() =>
                    setConfiguration((current) => ({
                      ...current,
                      registration: {
                        ...current.registration,
                        [setting.key]: !current.registration[setting.key],
                      },
                    }))
                  }
                />
              ))}
            </div>
            <div className="settings-field registration-deadline-field">
              <label htmlFor="registration-deadline">Registration deadline</label>
              <div>
                <input
                  id="registration-deadline"
                  onChange={(event) =>
                    setConfiguration((current) => ({
                      ...current,
                      registration: { ...current.registration, deadline: event.target.value },
                    }))
                  }
                  type="date"
                  value={configuration.registration.deadline}
                />
                <small>Users cannot register after this date.</small>
              </div>
            </div>
          </section>

          <section className="settings-card" id="notifications">
            <header>
              <h2>Notification Configuration</h2>
              <p>Control the notifications delivered to platform users.</p>
            </header>
            <div className="protocol-list">
              {notificationSettingDefinitions.map((setting) => (
                <Protocol
                  checked={configuration.notifications[setting.key]}
                  description={setting.description}
                  key={setting.key}
                  label={setting.label}
                  onChange={() =>
                    setConfiguration((current) => ({
                      ...current,
                      notifications: {
                        ...current.notifications,
                        [setting.key]: !current.notifications[setting.key],
                      },
                    }))
                  }
                />
              ))}
            </div>
          </section>

          <footer className="settings-actions">
            {saved && <span role="status">Configuration saved successfully.</span>}
            <button onClick={discardChanges} type="button">Discard changes</button>
            <button className="save-settings" type="submit">Save configuration</button>
          </footer>
        </div>
      </div>
    </form>
  );
}

function Protocol({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: () => void;
}) {
  return (
    <div className="protocol-row">
      <p><strong>{label}</strong><small>{description}</small></p>
      <button
        aria-checked={checked}
        aria-label={`${label}: ${checked ? "enabled" : "disabled"}`}
        className={`settings-toggle ${checked ? "enabled" : ""}`}
        onClick={onChange}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  );
}
