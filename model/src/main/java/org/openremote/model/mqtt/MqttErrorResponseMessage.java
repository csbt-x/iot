package org.openremote.model.mqtt;

import com.fasterxml.jackson.annotation.JsonCreator;

public class MqttErrorResponseMessage {

    public enum Error {
        MESSAGE_INVALID,
        NOT_FOUND,
        FORBIDDEN,
        SERVER_ERROR,
    }

    protected Error error;
    protected String message;

    @JsonCreator
    public MqttErrorResponseMessage(Error error) {
        this.error = error;
    }

    @JsonCreator
    public MqttErrorResponseMessage(Error error, String message) {
        this.error = error;
        this.message = message;
    }

    public Error getError() {
        return error;
    }
}
