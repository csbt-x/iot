/*
 * Copyright 2017, OpenRemote Inc.
 *
 * See the CONTRIBUTORS.txt file in the distribution for a
 * full listing of individual contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
package org.openremote.manager.server.rules;

import org.kie.api.definition.rule.Rule;
import org.kie.api.event.rule.BeforeMatchFiredEvent;
import org.kie.api.event.rule.DefaultAgendaEventListener;
import org.kie.api.runtime.rule.Match;
import org.openremote.model.syslog.SyslogLevel;

import java.util.List;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * This class logs Drools rule execution. It is intended to assist the user in debugging Drools behavior.
 */
public class RuleExecutionLogger extends DefaultAgendaEventListener {

    private static final Logger LOG = Logger.getLogger(RuleExecutionLogger.class.getName());

    final protected Supplier<String> contextSupplier;

    public RuleExecutionLogger(Supplier<String> contextSupplier) {
        this.contextSupplier = contextSupplier;
    }

    public static Logger getLOG() {
        return LOG;
    }

    @Override
    public void beforeMatchFired(BeforeMatchFiredEvent event) {
        final Rule rule = event.getMatch().getRule();
        String ruleName = rule.getName();

        String rulePackage = rule.getPackageName();
        ruleName = "\"" + ruleName + "\" // (package " + rulePackage + ")";

        Match matchEvent = event.getMatch();
        List<String> declarationIDs = matchEvent.getDeclarationIds();
        List<Object> antecedents = matchEvent.getObjects();

        String declarationLog = "";
        for (String declarationID : declarationIDs) {
            Object declarationValue = matchEvent.getDeclarationValue(declarationID);
            String declarationValueString = this.declarationValueToString(declarationValue);
            /* TODO Update for v3
            if (declarationValue instanceof Sensor || declarationValue instanceof SensorState) {
                declarationLog = String.format("%s\t\tDeclaration: \"%s\"\n\t\tValue:\n\t\t\t%s\n", declarationLog, declarationID, declarationValueString);
            } else {
                declarationLog = String.format("%s\t\tDeclaration: \"%s: %s\"\n", declarationLog, declarationID, declarationValueString);
            }
            */
            declarationLog = String.format("%s\t\tDeclaration: \"%s: %s\"\n", declarationLog, declarationID, declarationValueString);
        }

        String objectLog = "";
        for (Object antecedent : antecedents) {
            String theClass = antecedent.getClass().getSimpleName();
            String theValue = this.antecedentValueToString(antecedent);
            objectLog = String.format("%s\t\tClass: \"%s\"\n\t\tFields: \n\t\t\t%s\n", objectLog, theClass, theValue);
        }

        if (ruleName.startsWith("\"--")) {
            LOG.log(Level.INFO,
                String.format("*** On " + contextSupplier.get() + "\n\nRule %s\n\n" +
                    "\tDeclarations \n---------------------------------\n%s\n" +
                    "\tLHS objects(antecedents)\n---------------------------------\n%s", ruleName, declarationLog, objectLog)
            );
        } else if (ruleName.startsWith("\"-")) {
            LOG.log(Level.INFO,
                String.format("*** On " + contextSupplier.get() + "\nRule %s", ruleName)
            );
        } else {
            LOG.log(Level.FINE,
                String.format("*** On " + contextSupplier.get() + "\n\nRule %s\n\n" +
                    "\tDeclarations \n---------------------------------\n%s\n" +
                    "\tLHS objects(antecedents)\n---------------------------------\n%s", ruleName, declarationLog, objectLog)
            );
        }
    }

    /**
     * This method converts a declarationValue into a string.
     * The need for this method would be obviated if all our facts descended from
     * a Fact class with a method to return the most salient value of a fact.
     *
     * @param antecedent - An object referenced by a drools LHS
     */
    private String antecedentValueToString(Object antecedent) {
        String theValue = null;
        if (antecedent != null) {
            theValue = antecedent.toString();
        }

        /* TODO Update for v3
        if (antecedent instanceof Sensor) //may be unnecessary if we never have raw sensor objects in WM
        {
            Sensor theSensor = (Sensor) antecedent;
            String sensorName = theSensor.getSensorDefinition().getName();
            theValue = String.format("Sensor: %s\n", sensorName);

            theValue = String.format("%s\t\tSensor Properties\n", theValue);
            Map<String, String> sensorValues = theSensor.getSensorDefinition().getProperties();

            for (Map.Entry<String, String> entry : sensorValues.entrySet()) {
                String entryName = entry.getKey();
                String entryValue = entry.getValue();
                theValue = String.format("%sName: \t\"%s\"\n\t\t\tValue: \t\"%s\"", theValue, entryName, entryValue);
            }
        }
        if (antecedent instanceof SensorState) {
            SensorState theSensorState = (SensorState) antecedent;
            String sensorName = theSensorState.getSensorName();
            String stateValue = theSensorState.getValue().toString(); //assumes all values can directly cast to String
            theValue = String.format("Sensor name: \t\"%s\"\n\t\t\tState value: \t\"%s\"", sensorName, stateValue);
        }
        */

        return theValue;
    }

    /**
     * This method converts a declarationValue into a string.
     * The need for this method would be obviated if all our facts descended from
     * a Fact class with a method to return the unique identifier as a string.
     *
     * @param declarationValue - The object associated with a drools LHS declaration
     */
    private String declarationValueToString(Object declarationValue) {
        String convertedDeclarationValue = null;
        if (declarationValue != null) {
            convertedDeclarationValue = declarationValue.toString();
        }

        /* TODO Update for v3
        if (declarationValue instanceof Sensor) //may be unnecessary if we never have raw sensor objects in WM
        {
            convertedDeclarationValue = ((Sensor) declarationValue).getSensorDefinition().getName();
        }
        if (declarationValue instanceof SensorState) {
            String sensorName = ((SensorState) declarationValue).getSensorName();
            String sensorValue = ((SensorState) declarationValue).getValue().toString();
            convertedDeclarationValue = String.format("Sensor Name: \"%s\"\n\t\t\tSensor Value: \"%s\"", sensorName, sensorValue);
        }
        */

        return convertedDeclarationValue;
    }
}
