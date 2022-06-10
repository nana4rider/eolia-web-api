# eolia-web-api

Eolia Web API

# データベース構成の変更
```
npm run miggen -- [name]
npm run migrun
```

# Home Assistantの設定例
```yml
mqtt:
  climate:
    - name: 'エアコン'
      min_temp: 16
      max_temp: 30
      temp_step: 0.5
      preset_modes:
        - 'comfort'
        - 'boost'
        - 'eco'
        - 'sleep'
      current_temperature_topic: 'eolia/:deviceId/current_temperature/get'
      mode_command_topic: 'eolia/:deviceId/mode/set'
      mode_state_topic: 'eolia/:deviceId/mode/get'
      preset_mode_command_topic: 'eolia/:deviceId/preset_mode/set'
      preset_mode_state_topic: 'eolia/:deviceId/preset_mode/get'
      temperature_command_topic: 'eolia/:deviceId/temperature/set'
      temperature_state_topic: 'eolia/:deviceId/temperature/get'
      fan_mode_command_topic: 'eolia/:deviceId/fan_mode/set'
      fan_mode_state_topic: 'eolia/:deviceId/fan_mode/get'
      swing_mode_command_topic: 'eolia/:deviceId/swing_mode/set'
      swing_mode_state_topic: 'eolia/:deviceId/swing_mode/get'
```
