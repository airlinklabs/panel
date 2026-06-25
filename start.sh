#!/bin/bash
cd /workspaces/panel
exec node dist/app.js >> /workspaces/panel/airlink-session.log 2>&1
